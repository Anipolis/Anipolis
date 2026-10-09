import { createHmac, timingSafeEqual } from "node:crypto";
import {
	type AuthenticationResponseJSON,
	generateAuthenticationOptions,
	generateRegistrationOptions,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Cookies, json } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { getLastSignInAt } from "$lib/server/auth";
import { isBetaGateEnabled, isBetaMember } from "$lib/server/discord";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import type { Database } from "$lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;
type AuthUser = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"]>;
type AuthSession = Awaited<ReturnType<App.Locals["safeGetSession"]>>["session"];

const RP_NAME = "Anipolis";
/** パスキーの追加は、この時間内にログインし直したセッションでだけ許す */
export const PASSKEY_REAUTH_WINDOW_MS = 10 * 60_000;
export const MAX_PASSKEYS_PER_USER = 10;

/**
 * パスキー UI を出すかどうか。passkey_credentials のマイグレーションを適用してから true にする。
 */
export function isPasskeyEnabled(): boolean {
	return publicEnv["PUBLIC_PASSKEY_ENABLED"] === "true";
}

/** RP ID とオリジンはリクエスト先から決める（localhost でも本番ドメインでもそのまま動く） */
export function getRelyingParty(url: URL): { rpID: string; origin: string } {
	return { rpID: url.hostname, origin: url.origin };
}

export function isRecentlyAuthenticated(session: AuthSession, now = Date.now()): boolean {
	const signedInAt = getLastSignInAt(session);
	return signedInAt !== null && now - signedInAt <= PASSKEY_REAUTH_WINDOW_MS;
}

// ----------------------------------------------------------------
// 結果型。ルートは passkeyJson() でそのまま JSON レスポンスにする
// ----------------------------------------------------------------

export type PasskeyFailure = { ok: false; status: number; message: string; code?: "reauth_required" };
export type PasskeyResult<T> = { ok: true; data: T } | PasskeyFailure;

function failure(status: number, message: string): PasskeyFailure {
	return { ok: false, status, message };
}

function reauthRequired(): PasskeyFailure {
	return {
		ok: false,
		status: 403,
		code: "reauth_required",
		message: "セキュリティのため、ログインし直してからパスキーを追加してください",
	};
}

export function passkeyJson<T>(result: PasskeyResult<T>): Response {
	if (result.ok) return json(result.data);
	return json({ message: result.message, code: result.code ?? null }, { status: result.status });
}

// ----------------------------------------------------------------
// チャレンジは署名付き httpOnly Cookie で持ち回る（invites.ts の HMAC 署名パターンを踏襲）。
// 読んだ時点で必ず消すので、1つのチャレンジは1回しか検証に使えない。
// ----------------------------------------------------------------

type ChallengePurpose = "register" | "login";
export type ChallengeState = {
	purpose: ChallengePurpose;
	challenge: string;
	userId: string | null;
	expiresAt: number;
};

const CHALLENGE_COOKIE_NAME = "anipolis_passkey_challenge";
const CHALLENGE_COOKIE_PATH = "/api/auth/passkey";
const CHALLENGE_TTL_MS = 5 * 60_000;

function getChallengeSigningSecret(): string {
	return env["MULTI_ACCOUNT_COOKIE_SECRET"] ?? env["SUPABASE_SECRET_KEY"] ?? env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
}

function signChallenge(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64url");
}

function verifyChallengeSignature(payload: string, signature: string, secret: string): boolean {
	const expectedDigest = createHmac("sha256", secret).update(signChallenge(payload, secret)).digest();
	const actualDigest = createHmac("sha256", secret).update(signature).digest();
	return expectedDigest.length === actualDigest.length && timingSafeEqual(expectedDigest, actualDigest);
}

export function setChallengeCookie(
	cookies: Cookies,
	state: Omit<ChallengeState, "expiresAt">,
	now = Date.now(),
): boolean {
	const secret = getChallengeSigningSecret();
	if (!secret) {
		console.error("No signing secret configured for passkey challenge cookie");
		return false;
	}
	const payload = Buffer.from(JSON.stringify({ ...state, expiresAt: now + CHALLENGE_TTL_MS })).toString("base64url");
	cookies.set(CHALLENGE_COOKIE_NAME, `${payload}.${signChallenge(payload, secret)}`, {
		httpOnly: true,
		secure: !dev,
		sameSite: "strict",
		path: CHALLENGE_COOKIE_PATH,
		maxAge: CHALLENGE_TTL_MS / 1000,
	});
	return true;
}

/** チャレンジを取り出して Cookie を消す。改ざん・期限切れ・用途違いは null。 */
export function takeChallengeCookie(
	cookies: Cookies,
	purpose: ChallengePurpose,
	now = Date.now(),
): ChallengeState | null {
	const raw = cookies.get(CHALLENGE_COOKIE_NAME);
	cookies.delete(CHALLENGE_COOKIE_NAME, { path: CHALLENGE_COOKIE_PATH });
	if (!raw) return null;

	const secret = getChallengeSigningSecret();
	const dotIndex = raw.lastIndexOf(".");
	if (!secret || dotIndex <= 0) return null;
	const payload = raw.slice(0, dotIndex);
	if (!verifyChallengeSignature(payload, raw.slice(dotIndex + 1), secret)) return null;

	let state: Partial<ChallengeState>;
	try {
		state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<ChallengeState>;
	} catch {
		return null;
	}
	if (
		state.purpose !== purpose ||
		typeof state.challenge !== "string" ||
		typeof state.expiresAt !== "number" ||
		state.expiresAt <= now
	) {
		return null;
	}
	return {
		purpose,
		challenge: state.challenge,
		userId: typeof state.userId === "string" ? state.userId : null,
		expiresAt: state.expiresAt,
	};
}

// ----------------------------------------------------------------
// passkey_credentials テーブル
// ----------------------------------------------------------------

type PasskeyCredentialRow = Database["public"]["Tables"]["passkey_credentials"]["Row"];

export type PasskeySummary = Pick<
	PasskeyCredentialRow,
	"id" | "device_type" | "backed_up" | "created_at" | "last_used_at"
>;

export async function listPasskeys(
	supabase: Supabase,
	userId: string,
): Promise<{ passkeys: PasskeySummary[]; failed: boolean }> {
	const { data, error } = await supabase
		.from("passkey_credentials")
		.select("id, device_type, backed_up, created_at, last_used_at")
		.eq("user_id", userId)
		.order("created_at", { ascending: true });
	return { passkeys: data ?? [], failed: Boolean(error) };
}

export async function deletePasskey(supabase: Supabase, userId: string, passkeyId: string): Promise<boolean> {
	const { error } = await supabase.from("passkey_credentials").delete().eq("id", passkeyId).eq("user_id", userId);
	return !error;
}

function readCredentialResponse<T>(body: unknown): T | null {
	const response = body && typeof body === "object" && "response" in body ? body.response : null;
	if (!response || typeof response !== "object") return null;
	const { id, rawId, type, response: inner } = response as Record<string, unknown>;
	if (typeof id !== "string" || typeof rawId !== "string" || type !== "public-key") return null;
	if (!inner || typeof inner !== "object") return null;
	return response as T;
}

// ----------------------------------------------------------------
// 登録（ログイン中のユーザーが自分のパスキーを追加する）
// ----------------------------------------------------------------

type RegistrationContext = { supabase: Supabase; user: AuthUser; session: AuthSession; url: URL; cookies: Cookies };

export async function startPasskeyRegistration({
	supabase,
	user,
	session,
	url,
	cookies,
}: RegistrationContext): Promise<PasskeyResult<PublicKeyCredentialCreationOptionsJSON>> {
	if (!isRecentlyAuthenticated(session)) return reauthRequired();
	if (!user.email) return failure(400, "メールアドレスが登録されていないため、パスキーを登録できません");

	const { data: existing, error } = await supabase
		.from("passkey_credentials")
		.select("credential_id, transports")
		.eq("user_id", user.id);
	if (error) return failure(500, "パスキーの登録を開始できませんでした");
	const credentials = existing ?? [];
	if (credentials.length >= MAX_PASSKEYS_PER_USER) {
		return failure(400, `パスキーは${MAX_PASSKEYS_PER_USER}個まで登録できます`);
	}

	const { data: profile } = await supabase
		.from("profiles")
		.select("username, display_name")
		.eq("id", user.id)
		.maybeSingle();

	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: getRelyingParty(url).rpID,
		userName: profile?.username ?? user.email,
		userDisplayName: profile?.display_name ?? profile?.username ?? "",
		// 同じユーザーには毎回同じ user handle を渡す（認証器側で上書き扱いになる）
		userID: new TextEncoder().encode(user.id),
		attestationType: "none",
		excludeCredentials: credentials.map((credential) => ({
			id: credential.credential_id,
			transports: credential.transports,
		})),
		authenticatorSelection: { residentKey: "required", userVerification: "required" },
	});

	if (!setChallengeCookie(cookies, { purpose: "register", challenge: options.challenge, userId: user.id })) {
		return failure(500, "パスキーの登録を開始できませんでした");
	}
	return { ok: true, data: options };
}

export async function finishPasskeyRegistration({
	user,
	session,
	url,
	cookies,
	body,
}: RegistrationContext & { body: unknown }): Promise<PasskeyResult<{ registered: true }>> {
	const state = takeChallengeCookie(cookies, "register");
	if (!isRecentlyAuthenticated(session)) return reauthRequired();
	if (!user.email) return failure(400, "メールアドレスが登録されていないため、パスキーを登録できません");
	if (!state || state.userId !== user.id) {
		return failure(400, "登録の有効期限が切れました。もう一度お試しください");
	}

	const response = readCredentialResponse<RegistrationResponseJSON>(body);
	if (!response) return failure(400, "パスキーを確認できませんでした");

	const { rpID, origin } = getRelyingParty(url);
	let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
	try {
		verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: state.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			requireUserVerification: true,
		});
	} catch {
		return failure(400, "パスキーを確認できませんでした");
	}
	if (!verification.verified) return failure(400, "パスキーを確認できませんでした");

	const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;
	const { error } = await createServiceRoleClient()
		.from("passkey_credentials")
		.insert({
			user_id: user.id,
			credential_id: credential.id,
			public_key: isoBase64URL.fromBuffer(credential.publicKey),
			counter: credential.counter,
			transports: credential.transports ?? [],
			aaguid,
			device_type: credentialDeviceType,
			backed_up: credentialBackedUp,
		});
	if (error) {
		return error.code === "23505"
			? failure(409, "このパスキーはすでに登録されています")
			: failure(500, "パスキーを保存できませんでした");
	}
	return { ok: true, data: { registered: true } };
}

// ----------------------------------------------------------------
// ログイン（未ログインのユーザーがパスキーでセッションを得る）
// ----------------------------------------------------------------

export async function startPasskeyLogin({
	url,
	cookies,
}: {
	url: URL;
	cookies: Cookies;
}): Promise<PasskeyResult<PublicKeyCredentialRequestOptionsJSON>> {
	// allowCredentials を空にして、端末に保存されたパスキー（discoverable credential）から選ばせる
	const options = await generateAuthenticationOptions({
		rpID: getRelyingParty(url).rpID,
		userVerification: "required",
	});
	if (!setChallengeCookie(cookies, { purpose: "login", challenge: options.challenge, userId: null })) {
		return failure(500, "パスキーでのログインを開始できませんでした");
	}
	return { ok: true, data: options };
}

/**
 * Supabase Auth には「検証済みのユーザーとしてセッションを発行する」API が無いため、
 * service role でマジックリンクのトークンを発行し（メールは送られない）、
 * そのままサーバー側で verifyOtp してセッション Cookie を得る。
 */
async function signInAsUser(supabase: Supabase, admin: Supabase, userId: string, now: number): Promise<boolean> {
	const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
	const authUser = userData?.user;
	if (userError || !authUser?.email) return false;
	if (authUser.banned_until && new Date(authUser.banned_until).getTime() > now) return false;

	const { data: link, error: linkError } = await admin.auth.admin.generateLink({
		type: "magiclink",
		email: authUser.email,
	});
	const tokenHash = link?.properties?.hashed_token;
	if (linkError || !tokenHash) return false;

	const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
	return !error;
}

export async function finishPasskeyLogin({
	supabase,
	url,
	cookies,
	body,
	now = Date.now(),
}: {
	supabase: Supabase;
	url: URL;
	cookies: Cookies;
	body: unknown;
	now?: number;
}): Promise<PasskeyResult<{ signedIn: true }>> {
	const state = takeChallengeCookie(cookies, "login", now);
	if (!state) return failure(400, "ログインの有効期限が切れました。もう一度お試しください");

	const response = readCredentialResponse<AuthenticationResponseJSON>(body);
	if (!response) return failure(400, "パスキーを確認できませんでした");

	const admin = createServiceRoleClient();
	const { data: stored, error } = await admin
		.from("passkey_credentials")
		.select("id, user_id, credential_id, public_key, counter, transports")
		.eq("credential_id", response.id)
		.maybeSingle();
	if (error) return failure(500, "パスキーでログインできませんでした");
	if (!stored) return failure(400, "このパスキーは登録されていません。削除済みの可能性があります");

	const { rpID, origin } = getRelyingParty(url);
	let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
	try {
		verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: state.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			credential: {
				id: stored.credential_id,
				publicKey: isoBase64URL.toBuffer(stored.public_key),
				counter: Number(stored.counter),
				transports: stored.transports,
			},
			requireUserVerification: true,
		});
	} catch {
		return failure(400, "パスキーを確認できませんでした");
	}
	if (!verification.verified) return failure(400, "パスキーを確認できませんでした");

	const { data: updated, error: updateError } = await admin
		.from("passkey_credentials")
		.update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date(now).toISOString() })
		.eq("id", stored.id)
		.eq("counter", stored.counter)
		.select("id")
		.maybeSingle();
	if (updateError) return failure(500, "パスキーでログインできませんでした");
	if (!updated) return failure(409, "別のログイン処理でパスキーが更新されました。もう一度お試しください");

	if (!(await signInAsUser(supabase, admin, stored.user_id, now))) {
		return failure(500, "パスキーでログインできませんでした");
	}

	// パスキーは β 参加後にしか登録できないが、資格を外された場合に備えて確認する
	if (isBetaGateEnabled()) {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (!user || !isBetaMember(user)) {
			await supabase.auth.signOut();
			return failure(403, "このアカウントはクローズドβの参加資格を確認できませんでした");
		}
	}

	return { ok: true, data: { signedIn: true } };
}
