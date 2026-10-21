import { isRedirect } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("$lib/server/discord", () => ({
	grantBetaAccess: vi.fn(),
	isBetaGateEnabled: () => false,
	isBetaMember: () => true,
	verifyGuildMembership: vi.fn(),
}));
vi.mock("$lib/server/invites", () => ({
	clearInviteCodeCookie: vi.fn(),
	getInviteCodeCookie: () => null,
	redeemInviteCode: vi.fn(),
}));

const { GET } = await import("./+server");

async function locationOf(search: string, exchangeError: { code?: string } | null = null) {
	const supabase = {
		auth: {
			exchangeCodeForSession: vi.fn(async () => ({ error: exchangeError })),
			getUser: vi.fn(async () => ({ data: { user: null } })),
		},
	};
	try {
		await GET({
			url: new URL(`https://anipolis.net/auth/callback${search}`),
			cookies: {},
			locals: { supabase },
		} as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown.location;
		throw thrown;
	}
	throw new Error("expected a redirect");
}

describe("auth callback errors", () => {
	it("プロバイダーからのエラーは理由を付けて /auth に戻す", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(
			await locationOf(
				"?error=server_error&error_code=unexpected_failure&error_description=Error+getting+user+email",
			),
		).toBe("/auth?error=oauth_failed&reason=unexpected_failure");
		expect(await locationOf("?error=access_denied")).toBe("/auth?error=oauth_failed&reason=access_denied");
	});

	it("理由が符号の形でなければ unknown にする（URL から任意の文字を画面に出させない）", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await locationOf("?error=server_error&error_code=%3Cscript%3E")).toBe(
			"/auth?error=oauth_failed&reason=unknown",
		);
	});

	it("遷移先（next）も引き継ぐ", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await locationOf("?next=%2Fnotifications&error=server_error&error_code=unexpected_failure")).toBe(
			"/auth?error=oauth_failed&reason=unexpected_failure&next=%2Fnotifications",
		);
		// 外部の URL は引き継がない（sanitizeInternalRedirect で / になる）
		expect(await locationOf("?next=https%3A%2F%2Fevil.example&error=server_error")).toBe(
			"/auth?error=oauth_failed&reason=server_error",
		);
	});

	it("code の交換に失敗したら理由を付けて /auth に戻す", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await locationOf("?code=abc", { code: "flow_state_not_found" })).toBe(
			"/auth?error=oauth_failed&reason=flow_state_not_found",
		);
	});
});
