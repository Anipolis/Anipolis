import { beforeEach, describe, expect, it, vi } from "vitest";

const referenced = { value: false };
vi.mock("$lib/server/supabase-admin", () => ({
	createServiceRoleClient: () => ({
		from: () => ({
			select: () => ({
				contains: () => ({
					limit: async () => ({ data: referenced.value ? [{ id: "post-1" }] : [], error: null }),
				}),
			}),
		}),
	}),
}));
vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { DELETE } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";
const OWN_URL = `https://project.supabase.co/storage/v1/object/public/post-images/${USER}/1-a.png`;
const OTHER_URL = "https://project.supabase.co/storage/v1/object/public/post-images/someone-else/1-a.png";

const remove = vi.fn(async (_paths: string[]) => ({ data: [{}], error: null }));

function callDelete(body: unknown, user: { id: string } | null = { id: USER }) {
	const event = {
		request: new Request("http://localhost/api/upload", {
			method: "DELETE",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
		locals: {
			supabase: { storage: { from: () => ({ remove }) } },
			safeGetSession: async () => ({ user, session: null }),
		},
	};
	return DELETE(event as unknown as Parameters<typeof DELETE>[0]);
}

beforeEach(() => {
	referenced.value = false;
	remove.mockClear();
});

describe("DELETE /api/upload（#330）", () => {
	it("投稿に使われていない自分の画像を消す", async () => {
		const res = await callDelete({ url: OWN_URL });
		expect(await res.json()).toEqual({ removed: true });
		expect(remove).toHaveBeenCalledWith([`${USER}/1-a.png`]);
	});

	it("どれかの投稿に使われている画像は消さない", async () => {
		referenced.value = true;
		const res = await callDelete({ url: OWN_URL });
		expect(await res.json()).toEqual({ removed: false });
		expect(remove).not.toHaveBeenCalled();
	});

	it("他人のフォルダ・不正な URL・未ログインは拒否する", async () => {
		await expect(callDelete({ url: OTHER_URL })).rejects.toMatchObject({ status: 400 });
		await expect(callDelete({ url: "https://example.com/a.png" })).rejects.toMatchObject({ status: 400 });
		await expect(callDelete({})).rejects.toMatchObject({ status: 400 });
		await expect(callDelete({ url: OWN_URL }, null)).rejects.toMatchObject({ status: 401 });
		expect(remove).not.toHaveBeenCalled();
	});
});
