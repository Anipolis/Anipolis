import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { DELETE } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";

const avatarUrl = (name: string) =>
	`https://project.supabase.co/storage/v1/object/public/profile-avatars/${USER}/${name}`;

function makeEvent(
	options: {
		user?: { id: string } | null;
		updateError?: boolean;
		files?: string[];
		currentAvatarUrl?: string | null;
	} = {},
) {
	const updates: unknown[] = [];
	const removed: string[][] = [];
	const supabase = {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: async () => ({
						data: {
							avatar_url:
								options.currentAvatarUrl === undefined
									? avatarUrl("avatar_1.webp")
									: options.currentAvatarUrl,
						},
						error: null,
					}),
				}),
			}),
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
	it("プロフィールのアイコンを空にして、外す前のアイコンだけを消す", async () => {
		// avatar_2 は別のタブで同時に保存された新しいアイコン。消してはいけない
		const { event, updates, removed } = makeEvent({ files: ["avatar_1.webp", "avatar_2.webp"] });
		const response = await DELETE(event);
		expect(response.status).toBe(200);
		expect(updates).toEqual([{ avatar_url: null }]);
		expect(removed).toEqual([[`${USER}/avatar_1.webp`]]);
	});

	it("自分のフォルダ以外の URL（外部サービスのアイコンなど）のときは何も消さない", async () => {
		const { event, removed } = makeEvent({ currentAvatarUrl: "https://cdn.discordapp.com/avatars/1/a.png" });
		const response = await DELETE(event);
		expect(response.status).toBe(200);
		expect(removed).toEqual([]);
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
