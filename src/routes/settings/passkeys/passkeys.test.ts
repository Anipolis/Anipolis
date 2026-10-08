import { afterEach, describe, expect, it, vi } from "vitest";
import { actions } from "./+page.server";

type Action = NonNullable<(typeof actions)["delete"]>;

const deletePasskey = actions["delete"];
const reauth = actions["reauth"];
if (!deletePasskey || !reauth) throw new Error("passkey actions are not exported");

const PASSKEY_ID = "0b6f1f2e-4a7c-4d2b-9a51-3f0e8c1d2b47";

function makeEvent(
	action: "delete" | "reauth",
	fields: Record<string, string>,
	options: { deleteError?: unknown; signInError?: unknown; loggedIn?: boolean } = {},
) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	const request = new Request(`http://localhost/settings/passkeys?/${action}`, { method: "POST", body: form });

	const eqUser = vi.fn(async () => ({ error: options.deleteError ?? null }));
	const eqId = vi.fn(() => ({ eq: eqUser }));
	const del = vi.fn(() => ({ eq: eqId }));
	const supabase = {
		from: vi.fn(() => ({ delete: del })),
		auth: { signInWithPassword: vi.fn(async () => ({ error: options.signInError ?? null })) },
	};
	const loggedIn = options.loggedIn ?? true;
	const event = {
		request,
		locals: {
			supabase,
			safeGetSession: async () => ({
				session: null,
				user: loggedIn ? { id: `user-${action}-${Math.random()}`, email: "u@example.com" } : null,
			}),
		},
	} as unknown as Parameters<Action>[0];
	return { event, supabase, eqId, eqUser };
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("settings/passkeys delete", () => {
	it("ログインしていなければ削除しない", async () => {
		const { event, supabase } = makeEvent("delete", { passkey_id: PASSKEY_ID }, { loggedIn: false });
		expect(await deletePasskey(event)).toMatchObject({ status: 401 });
		expect(supabase.from).not.toHaveBeenCalled();
	});

	it("UUID でない ID は弾く", async () => {
		const { event, supabase } = makeEvent("delete", { passkey_id: "../user" });
		expect(await deletePasskey(event)).toMatchObject({ status: 400 });
		expect(supabase.from).not.toHaveBeenCalled();
	});

	it("自分のパスキーに絞って削除する", async () => {
		const { event, supabase, eqId, eqUser } = makeEvent("delete", { passkey_id: PASSKEY_ID });
		expect(await deletePasskey(event)).toEqual({ deleted: true });
		expect(supabase.from).toHaveBeenCalledWith("passkey_credentials");
		expect(eqId).toHaveBeenCalledWith("id", PASSKEY_ID);
		expect(eqUser).toHaveBeenCalledWith("user_id", expect.stringMatching(/^user-delete-/));
	});

	it("削除に失敗したらエラーを返す", async () => {
		const { event } = makeEvent("delete", { passkey_id: PASSKEY_ID }, { deleteError: { message: "boom" } });
		expect(await deletePasskey(event)).toMatchObject({ status: 500 });
	});
});

describe("settings/passkeys reauth", () => {
	it("自分のメールアドレスでパスワードを確認し直す", async () => {
		const { event, supabase } = makeEvent("reauth", { password: "secret" });
		expect(await reauth(event)).toEqual({ reauthenticated: true });
		expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "u@example.com", password: "secret" });
	});

	it("パスワードが違えばエラーを返す", async () => {
		const { event } = makeEvent("reauth", { password: "wrong" }, { signInError: { message: "invalid" } });
		expect(await reauth(event)).toMatchObject({ status: 400 });
	});

	it("パスワードが空なら確認しない", async () => {
		const { event, supabase } = makeEvent("reauth", { password: "" });
		expect(await reauth(event)).toMatchObject({ status: 400 });
		expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
	});
});
