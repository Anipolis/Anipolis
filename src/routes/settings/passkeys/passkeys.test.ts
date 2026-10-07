import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/passkey", () => ({ isPasskeyEnabled: () => true }));

const { actions } = await import("./+page.server");

const deletePasskey = actions["delete"];
if (!deletePasskey) throw new Error("passkey delete action is not exported");

const PASSKEY_ID = "0b6f1f2e-4a7c-4d2b-9a51-3f0e8c1d2b47";

function makeEvent(passkeyId: string, deleteResult: { error: unknown } = { error: null }, loggedIn = true) {
	const form = new FormData();
	form.set("passkey_id", passkeyId);
	const request = new Request("http://localhost/settings/passkeys?/delete", { method: "POST", body: form });
	const supabase = { auth: { passkey: { delete: vi.fn(async () => deleteResult) } } };
	const event = {
		request,
		locals: {
			supabase,
			safeGetSession: async () => ({ session: null, user: loggedIn ? { id: "user-1" } : null }),
		},
	} as unknown as Parameters<typeof deletePasskey>[0];
	return { event, supabase };
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("settings/passkeys delete", () => {
	it("ログインしていなければ削除しない", async () => {
		const { event, supabase } = makeEvent(PASSKEY_ID, { error: null }, false);
		const result = await deletePasskey(event);
		expect(result).toMatchObject({ status: 401 });
		expect(supabase.auth.passkey.delete).not.toHaveBeenCalled();
	});

	it("UUID でない ID は Auth API に渡さない", async () => {
		const { event, supabase } = makeEvent("../user");
		const result = await deletePasskey(event);
		expect(result).toMatchObject({ status: 400 });
		expect(supabase.auth.passkey.delete).not.toHaveBeenCalled();
	});

	it("指定したパスキーを削除する", async () => {
		const { event, supabase } = makeEvent(PASSKEY_ID);
		const result = await deletePasskey(event);
		expect(result).toEqual({ deleted: true });
		expect(supabase.auth.passkey.delete).toHaveBeenCalledWith({ passkeyId: PASSKEY_ID });
	});

	it("Auth API が失敗したらエラーを返す", async () => {
		const { event } = makeEvent(PASSKEY_ID, { error: { message: "boom" } });
		const result = await deletePasskey(event);
		expect(result).toMatchObject({ status: 500 });
	});
});
