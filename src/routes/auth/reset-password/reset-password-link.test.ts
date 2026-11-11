import { isRedirect } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setPasswordRecoveryCookie = vi.fn();

vi.mock("$lib/server/password-reset", () => ({
	clearPasswordRecoveryCookie: vi.fn(),
	getPasswordRecoveryUserId: () => null,
	setPasswordRecoveryCookie: (...args: unknown[]) => setPasswordRecoveryCookie(...(args as [])),
}));
vi.mock("$lib/server/rate-limit", () => ({ isRateLimited: () => false }));

const { load } = await import("./+page.server");

async function open(search: string, headers: Record<string, string>) {
	const verifyOtp = vi.fn(async () => ({ data: { user: { id: "attacker" } }, error: null }));
	const exchangeCodeForSession = vi.fn(async () => ({ data: { user: { id: "attacker" } }, error: null }));
	const url = new URL(`https://anipolis.net/auth/reset-password${search}`);
	const event = {
		url,
		request: new Request(url, { headers }),
		cookies: {},
		locals: {
			supabase: { auth: { verifyOtp, exchangeCodeForSession } },
			safeGetSession: async () => ({ user: null, session: null }),
		},
	};
	try {
		const data = await load(event as never);
		return { data, location: null, verifyOtp, exchangeCodeForSession };
	} catch (thrown) {
		if (isRedirect(thrown)) return { data: null, location: thrown.location, verifyOtp, exchangeCodeForSession };
		throw thrown;
	}
}

describe("/auth/reset-password のリンクの確認", () => {
	beforeEach(() => {
		setPasswordRecoveryCookie.mockClear();
	});

	it("メールのリンクを開いたとき（ページ遷移）は確認して、クエリの無い URL に戻す", async () => {
		const opened = await open("?token_hash=abc&type=recovery", { "sec-fetch-dest": "document" });
		expect(opened.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
		expect(setPasswordRecoveryCookie).toHaveBeenCalledWith({}, "attacker");
		expect(opened.location).toBe("/auth/reset-password");
	});

	it("Sec-Fetch-Dest を送らないブラウザ・メールアプリからは、これまで通り確認する", async () => {
		const opened = await open("?token_hash=abc&type=recovery", {});
		expect(opened.verifyOtp).toHaveBeenCalledOnce();
		expect(opened.location).toBe("/auth/reset-password");
	});

	it("画像や fetch として読み込まれたときは確認せず、トークンも使わない", async () => {
		// アイコンの URL などにこのリンクを入れられても、表示しただけの人をログインさせない
		for (const destination of ["image", "empty", "iframe"]) {
			for (const search of ["?token_hash=abc&type=recovery", "?code=abc"]) {
				const blocked = await open(search, { "sec-fetch-dest": destination });
				expect(blocked.data).toMatchObject({ state: "invalid" });
				expect(blocked.verifyOtp).not.toHaveBeenCalled();
				expect(blocked.exchangeCodeForSession).not.toHaveBeenCalled();
				expect(setPasswordRecoveryCookie).not.toHaveBeenCalled();
			}
		}
	});
});
