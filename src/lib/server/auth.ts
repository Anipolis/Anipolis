type AuthUser = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"]>;
type AuthSession = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["session"]>;

function getJwtPayload(session: AuthSession | null) {
	if (!session?.access_token) return null;

	const [, payload] = session.access_token.split(".");
	if (!payload) return null;

	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
			amr?: { method?: string; timestamp?: number }[];
			app_metadata?: {
				provider?: string;
				providers?: string | string[];
			};
			user_metadata?: {
				has_password?: boolean | string;
			};
		};
	} catch {
		return null;
	}
}

/**
 * ユーザーがパスワード（email プロバイダー）を持つかを判定する。
 *
 * セキュリティ上の注意: `user_metadata.has_password` はクライアントが
 * `supabase.auth.updateUser({ data })` で自由に書き換えられる値である。
 * この関数の OR 条件では「パスワード確認を追加で要求する」フェイルセーフ方向にしか
 * 働かないため問題ないが、**この判定を「検証をスキップしてよい」方向の分岐に
 * 流用してはならない**。信頼できる信号は identities / app_metadata / amr のみ。
 */
export function hasPasswordProvider(user: AuthUser, session: AuthSession | null = null) {
	const providers = user.app_metadata.providers;
	const providerList = typeof providers === "string" ? [providers] : Array.isArray(providers) ? providers : [];
	const payload = getJwtPayload(session);
	const payloadProviders = payload?.app_metadata?.providers;
	const payloadProviderList =
		typeof payloadProviders === "string"
			? [payloadProviders]
			: Array.isArray(payloadProviders)
				? payloadProviders
				: [];

	return (
		user.identities?.some((id) => id.provider === "email") ||
		user.app_metadata.provider === "email" ||
		providerList.includes("email") ||
		user.user_metadata["has_password"] === true ||
		user.user_metadata["has_password"] === "true" ||
		payload?.app_metadata?.provider === "email" ||
		payloadProviderList.includes("email") ||
		payload?.user_metadata?.has_password === true ||
		payload?.user_metadata?.has_password === "true" ||
		payload?.amr?.some((entry) => entry.method === "password")
	);
}

/**
 * このセッションで最後に本人確認（ログイン）した時刻（ms）。取れなければ null。
 * amr はリフレッシュしても引き継がれるので、「直近にログインし直したか」の判定に使える。
 * session は safeGetSession() で getUser() による検証を通ったものを渡すこと。
 */
export function getLastSignInAt(session: AuthSession | null): number | null {
	const timestamps = (getJwtPayload(session)?.amr ?? [])
		.map((entry) => entry.timestamp)
		.filter((timestamp): timestamp is number => typeof timestamp === "number" && Number.isFinite(timestamp));
	return timestamps.length > 0 ? Math.max(...timestamps) * 1000 : null;
}
