import { isRedirect } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = { enabled: false };
const redeemInviteCode = vi.fn();
const grantBetaAccess = vi.fn(async () => ({ error: null }));
const clearInviteCodeCookie = vi.fn();
let cookieCode: string | null = null;

vi.mock("$lib/server/discord", () => ({
	grantBetaAccess: (...args: unknown[]) => grantBetaAccess(...(args as [])),
	isBetaGateEnabled: () => gate.enabled,
	isBetaMember: (user: { app_metadata?: { beta_member?: boolean } }) => user.app_metadata?.beta_member === true,
}));
vi.mock("$lib/server/invites", () => ({
	clearInviteCodeCookie: (...args: unknown[]) => clearInviteCodeCookie(...(args as [])),
	getInviteCodeCookie: () => cookieCode,
	redeemInviteCode: (...args: unknown[]) => redeemInviteCode(...(args as [])),
}));

const { GET } = await import("./+server");

type User = { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };

async function run(search: string, verify: { user: User | null; error: { code?: string } | null }) {
	const signOut = vi.fn(async () => ({}));
	const verifyOtp = vi.fn(async () => ({ data: { user: verify.user }, error: verify.error }));
	try {
		await GET({
			url: new URL(`https://anipolis.net/auth/confirm${search}`),
			cookies: {},
			locals: { supabase: { auth: { verifyOtp, signOut } } },
		} as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return { location: thrown.location, verifyOtp, signOut };
		throw thrown;
	}
	throw new Error("expected a redirect");
}

describe("/auth/confirm", () => {
	beforeEach(() => {
		gate.enabled = false;
		cookieCode = null;
		redeemInviteCode.mockReset();
		grantBetaAccess.mockClear();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("確認できたら next（内部のパスだけ）へ進む", async () => {
		const ok = await run("?token_hash=abc&type=email&next=%2Fnotifications", { user: { id: "u1" }, error: null });
		expect(ok.location).toBe("/notifications");
		expect(ok.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
		expect(
			(
				await run("?token_hash=abc&type=email&next=https%3A%2F%2Fevil.example", {
					user: { id: "u1" },
					error: null,
				})
			).location,
		).toBe("/");
	});

	it("リンクの形が違えば確認せずに失敗を出す", async () => {
		const r = await run("?token_hash=abc&type=recovery", { user: null, error: null });
		expect(r.location).toBe("/auth?error=confirm_failed&reason=invalid_link");
		expect(r.verifyOtp).not.toHaveBeenCalled();
	});

	it("確認に失敗したら理由を付けて /auth に戻す", async () => {
		const r = await run("?token_hash=abc&type=email", { user: null, error: { code: "otp_expired" } });
		expect(r.location).toBe("/auth?error=confirm_failed&reason=otp_expired");
	});

	it("クローズドβ: Cookie が無くても、登録時にアカウントへ残した招待コードで参加資格を付ける", async () => {
		gate.enabled = true;
		redeemInviteCode.mockResolvedValue({ success: true });
		const r = await run("?token_hash=abc&type=email", {
			user: { id: "u1", user_metadata: { invite_code: "CODE-1" } },
			error: null,
		});
		expect(redeemInviteCode).toHaveBeenCalledWith(expect.anything(), "CODE-1");
		expect(grantBetaAccess).toHaveBeenCalledWith("u1");
		expect(r.location).toBe("/");
	});

	it("クローズドβ: 招待コードが無ければログインさせない", async () => {
		gate.enabled = true;
		const r = await run("?token_hash=abc&type=email", { user: { id: "u1" }, error: null });
		expect(r.signOut).toHaveBeenCalled();
		expect(r.location).toBe("/auth?error=invite_required");
	});
});
