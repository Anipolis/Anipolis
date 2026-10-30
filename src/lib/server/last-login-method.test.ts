import { describe, expect, it } from "vitest";
import { detectOAuthLoginMethod, getLastLoginMethod, setLastLoginMethod } from "./last-login-method";

function makeCookies(initial?: string) {
	const store = new Map<string, string>(initial ? [["anipolis_last_login", initial]] : []);
	const options: Record<string, unknown>[] = [];
	return {
		get: (name: string) => store.get(name),
		set: (name: string, value: string, opts: Record<string, unknown>) => {
			store.set(name, value);
			options.push(opts);
		},
		options,
	};
}

describe("前回のログイン方法", () => {
	it("知っている方法だけを読む（書き換えられた Cookie は無視する）", () => {
		expect(getLastLoginMethod(makeCookies("discord"))).toBe("discord");
		expect(getLastLoginMethod(makeCookies("email"))).toBe("email");
		expect(getLastLoginMethod(makeCookies("<script>"))).toBeNull();
		expect(getLastLoginMethod(makeCookies())).toBeNull();
	});

	it("JavaScript から読めない・1 年残る Cookie に方法の名前だけを書く", () => {
		const cookies = makeCookies();
		setLastLoginMethod(cookies as never, "google");
		expect(cookies.get("anipolis_last_login")).toBe("google");
		expect(cookies.options[0]).toMatchObject({ path: "/", httpOnly: true, sameSite: "lax", maxAge: 31_536_000 });
	});

	it("外部サービスは最後にログインした時刻がいちばん新しいものにする", () => {
		const user = {
			identities: [
				{ provider: "email", last_sign_in_at: "2026-10-25T10:00:00Z" },
				{ provider: "discord", last_sign_in_at: "2026-10-20T10:00:00Z" },
				{ provider: "google", last_sign_in_at: "2026-10-24T10:00:00Z" },
			],
		};
		expect(detectOAuthLoginMethod(user as never)).toBe("google");
	});

	it("X は provider 名が twitter でも x にそろえる", () => {
		expect(
			detectOAuthLoginMethod({
				identities: [{ provider: "twitter", last_sign_in_at: "2026-10-25T10:00:00Z" }],
			} as never),
		).toBe("x");
	});

	it("外部サービスがつながっていなければ記録しない", () => {
		expect(
			detectOAuthLoginMethod({
				identities: [{ provider: "email", last_sign_in_at: "2026-10-25T10:00:00Z" }],
			} as never),
		).toBeNull();
		expect(detectOAuthLoginMethod({ identities: undefined } as never)).toBeNull();
	});
});
