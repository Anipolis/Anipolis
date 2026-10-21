import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceUpdate = vi.fn();
const serviceEq = vi.fn();
vi.mock("$lib/server/supabase-admin", () => ({
	createServiceRoleClient: () => ({
		from: (table: string) => ({
			update: (values: unknown) => {
				serviceUpdate(table, values);
				return { eq: async (column: string, value: string) => serviceEq(column, value) };
			},
		}),
	}),
}));

import { actions } from "./+page.server";

const USER = {
	id: "11111111-1111-4111-8111-111111111111",
	email: "a@example.com",
	app_metadata: { providers: ["email"] },
};

const userUpdate = vi.fn();
const signInWithPassword = vi.fn();

function callUpdateUsername(fields: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	const event = {
		request: new Request("http://localhost/settings/account?/updateUsername", { method: "POST", body: form }),
		locals: {
			supabase: {
				auth: { signInWithPassword },
				from: () => ({ update: userUpdate }),
			},
			safeGetSession: async () => ({ user: USER, session: null }),
		},
	};
	const updateUsername = actions["updateUsername"];
	if (!updateUsername) throw new Error("updateUsername action is missing");
	return updateUsername(event as unknown as Parameters<typeof updateUsername>[0]);
}

beforeEach(() => {
	serviceUpdate.mockClear();
	serviceEq.mockReset();
	serviceEq.mockResolvedValue({ error: null });
	userUpdate.mockClear();
	signInWithPassword.mockReset();
	signInWithPassword.mockResolvedValue({ error: null });
});

describe("ユーザー名の変更（#236）", () => {
	it("現在のパスワードを確かめた後、service role で書き換える（利用者の権限では更新しない）", async () => {
		const result = await callUpdateUsername({ username: "New_Name", current_password: "pw" });
		expect(result).toEqual({ success: true });
		expect(signInWithPassword).toHaveBeenCalledWith({ email: USER.email, password: "pw" });
		expect(serviceUpdate).toHaveBeenCalledWith("profiles", { username: "new_name" });
		expect(serviceEq).toHaveBeenCalledWith("id", USER.id);
		expect(userUpdate).not.toHaveBeenCalled();
	});

	it("パスワードが違えば書き換えない", async () => {
		signInWithPassword.mockResolvedValue({ error: { message: "invalid" } });
		const result = await callUpdateUsername({ username: "new_name", current_password: "wrong" });
		expect(result).toMatchObject({ status: 400, data: { field: "current_password" } });
		expect(serviceUpdate).not.toHaveBeenCalled();
	});

	it("形式が違うユーザー名は、パスワードを確かめる前に拒否する", async () => {
		const result = await callUpdateUsername({ username: "ab", current_password: "pw" });
		expect(result).toMatchObject({ status: 400, data: { field: "username" } });
		expect(signInWithPassword).not.toHaveBeenCalled();
		expect(serviceUpdate).not.toHaveBeenCalled();
	});

	it("使用中・保留中のユーザー名は項目のエラーにする", async () => {
		serviceEq.mockResolvedValue({ error: { code: "23505", message: "duplicate key value" } });
		const result = await callUpdateUsername({ username: "taken_name", current_password: "pw" });
		expect(result).toMatchObject({ status: 400, data: { field: "username" } });
	});
});
