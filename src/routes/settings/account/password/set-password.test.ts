import { describe, expect, it, vi } from "vitest";
import { actions } from "./+page.server";

// actions は Record 型なので、テスト対象を先に取り出して存在を保証する
const setPassword = actions["setPassword"];
const requestReauth = actions["requestReauth"];
if (!setPassword || !requestReauth) throw new Error("password actions are not exported");

type AuthResult = { error: { code?: string; message: string } | null };

function oauthUser() {
	// Google でログインしていてパスワード未設定の利用者
	return {
		id: "user-oauth",
		email: "u@example.com",
		user_metadata: {},
		app_metadata: { provider: "google", providers: ["google"] },
		identities: [{ provider: "google" }],
	};
}

function makeEvent(
	action: "setPassword" | "requestReauth",
	fields: Record<string, string>,
	auth: { updateUser?: AuthResult; reauthenticate?: AuthResult; signInWithPassword?: AuthResult },
	user: ReturnType<typeof oauthUser> | null = oauthUser(),
) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	const request = new Request(`http://localhost/settings/account/password?/${action}`, {
		method: "POST",
		body: form,
	});
	const supabase = {
		auth: {
			updateUser: vi.fn(async () => auth.updateUser ?? { error: null }),
			reauthenticate: vi.fn(async () => auth.reauthenticate ?? { error: null }),
			signInWithPassword: vi.fn(async () => auth.signInWithPassword ?? { error: null }),
		},
	};
	const event = {
		request,
		locals: { supabase, safeGetSession: async () => ({ user, session: null }) },
	};
	return { event: event as unknown as Parameters<NonNullable<typeof setPassword>>[0], supabase };
}

describe("setPassword with secure password change", () => {
	it("passes the nonce through to updateUser for users without a password provider", async () => {
		const { event, supabase } = makeEvent(
			"setPassword",
			{ password: "abcdef1", confirm: "abcdef1", nonce: "１２３ 456" },
			{},
		);

		const result = await setPassword(event);

		expect(result).toEqual({ success: true });
		expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
		expect(supabase.auth.updateUser).toHaveBeenCalledWith({
			password: "abcdef1",
			nonce: "123456",
			data: { has_password: true },
		});
	});

	it("asks for a confirmation code when Auth demands reauthentication", async () => {
		const { event } = makeEvent(
			"setPassword",
			{ password: "abcdef1", confirm: "abcdef1" },
			{
				updateUser: {
					error: { code: "reauthentication_needed", message: "Password update requires reauthentication" },
				},
			},
		);

		const result = await setPassword(event);

		expect(result).toMatchObject({ status: 400, data: { field: "nonce", reauthRequired: true } });
	});

	it("reports an invalid or expired code without treating it as a generic failure", async () => {
		const { event } = makeEvent(
			"setPassword",
			{ password: "abcdef1", confirm: "abcdef1", nonce: "000000" },
			{ updateUser: { error: { code: "reauthentication_not_valid", message: "Invalid nonce" } } },
		);

		const result = await setPassword(event);

		expect(result).toMatchObject({ status: 400, data: { field: "nonce", reauthRequired: true } });
	});

	it("rejects anonymous callers", async () => {
		const { event } = makeEvent("setPassword", { password: "abcdef1", confirm: "abcdef1" }, {}, null);
		await expect(setPassword(event)).resolves.toMatchObject({ status: 401 });
	});
});

describe("requestReauth", () => {
	it("sends the confirmation code through Supabase reauthenticate", async () => {
		const { event, supabase } = makeEvent("requestReauth", {}, {});
		const result = await requestReauth(event as unknown as Parameters<NonNullable<typeof requestReauth>>[0]);
		expect(result).toEqual({ reauthSent: true });
		expect(supabase.auth.reauthenticate).toHaveBeenCalledTimes(1);
	});

	it("surfaces a send failure", async () => {
		const { event } = makeEvent("requestReauth", {}, { reauthenticate: { error: { message: "smtp down" } } });
		const result = await requestReauth(event as unknown as Parameters<NonNullable<typeof requestReauth>>[0]);
		expect(result).toMatchObject({ status: 500 });
	});
});
