import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { DELETE } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";

function makeEvent(options: { user?: { id: string } | null; updateError?: boolean; files?: string[] } = {}) {
	const updates: unknown[] = [];
	const removed: string[][] = [];
	const supabase = {
		from: () => ({
			update: (values: unknown) => {
				updates.push(values);
				return {
					eq: () => ({
						select: () => ({
							maybeSingle: async () =>
								options.updateError
									? { data: null, error: { message: "db" } }
									: { data: { id: USER }, error: null },
						}),
					}),
				};
			},
		}),
		storage: {
			from: () => ({
				list: async () => ({ data: (options.files ?? []).map((name) => ({ name })), error: null }),
				remove: async (paths: string[]) => {
					removed.push(paths);
					return { data: [], error: null };
				},
			}),
		},
	};
	const event = {
		locals: {
			supabase,
			safeGetSession: async () => ({ user: options.user === undefined ? { id: USER } : options.user }),
		},
	};
	return { event: event as unknown as Parameters<typeof DELETE>[0], updates, removed };
}

describe("アイコン画像の削除", () => {
	it("プロフィールのアイコンを空にして、保存していた画像を消す", async () => {
		const { event, updates, removed } = makeEvent({ files: ["avatar_1.webp"] });
		const response = await DELETE(event);
		expect(response.status).toBe(200);
		expect(updates).toEqual([{ avatar_url: null }]);
		expect(removed).toEqual([[`${USER}/avatar_1.webp`]]);
	});

	it("ログインしていなければ 401", async () => {
		const { event } = makeEvent({ user: null });
		await expect(DELETE(event)).rejects.toMatchObject({ status: 401 });
	});

	it("プロフィールを更新できなければ画像は消さない", async () => {
		const { event, removed } = makeEvent({ updateError: true, files: ["avatar_1.webp"] });
		await expect(DELETE(event)).rejects.toMatchObject({ status: 500 });
		expect(removed).toEqual([]);
	});
});
