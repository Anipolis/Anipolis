import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "../supabase/database.types.ts";
import { listUserStorageFiles, STORAGE_LIST_PAGE_SIZE } from "./account-storage-cleanup";

/** パスの一覧から、Storage の list と同じく直下の項目（フォルダは id が null）を返すだけの模型 */
function storageOf(paths: string[]) {
	const calls: string[] = [];
	const client = {
		storage: {
			from: () => ({
				list: async (prefix: string, options?: { limit?: number; offset?: number }) => {
					calls.push(prefix);
					const children = new Map<string, { name: string; id: string | null }>();
					for (const path of paths) {
						if (!path.startsWith(`${prefix}/`)) continue;
						const [head, ...tail] = path.slice(prefix.length + 1).split("/");
						if (head) children.set(head, { name: head, id: tail.length > 0 ? null : `id-${path}` });
					}
					const sorted = [...children.values()].sort((a, b) => a.name.localeCompare(b.name));
					const offset = options?.offset ?? 0;
					return { data: sorted.slice(offset, offset + (options?.limit ?? 100)), error: null };
				},
			}),
		},
	} as unknown as SupabaseClient<Database>;
	return { client, calls };
}

describe("listUserStorageFiles（#391 / #397 Codex）", () => {
	it("フォルダだけで上限を超えても、ファイルに届くまで降りて消せるものを返す", async () => {
		// 直下にフォルダが上限より多くあり、それぞれの中にファイルが1件ずつ
		const paths = Array.from({ length: 30 }, (_, i) => `user-1/f${String(i).padStart(2, "0")}/a.webp`);
		const { client } = storageOf(paths);
		const listing = await listUserStorageFiles(client, "post-images", "user-1", 10);
		expect(listing?.complete).toBe(false);
		expect(listing?.paths.length).toBeGreaterThan(0);
		expect(listing?.paths[0]).toBe("user-1/f00/a.webp");
	});

	it("深い入れ子にしかファイルが無くても、上限に関係なくそこまで降りる", async () => {
		const deep = `user-1/${Array.from({ length: 15 }, (_, i) => `d${i}`).join("/")}/deep.webp`;
		const { client } = storageOf([deep]);
		const listing = await listUserStorageFiles(client, "post-images", "user-1", 5);
		expect(listing).toEqual({ paths: [deep], complete: true });
	});

	it("上限内なら全部たどって complete: true を返す", async () => {
		const paths = ["user-1/a.webp", "user-1/sub/b.webp", "user-1/sub/deep/c.webp"];
		const { client } = storageOf(paths);
		expect(await listUserStorageFiles(client, "post-images", "user-1")).toEqual({
			paths: ["user-1/a.webp", "user-1/sub/b.webp", "user-1/sub/deep/c.webp"],
			complete: true,
		});
	});

	it("1ページを超えるフォルダも続きのページを読む", async () => {
		const paths = Array.from(
			{ length: STORAGE_LIST_PAGE_SIZE + 5 },
			(_, i) => `user-1/${String(i).padStart(5, "0")}.webp`,
		);
		const { client, calls } = storageOf(paths);
		const listing = await listUserStorageFiles(client, "post-images", "user-1");
		expect(listing?.paths).toHaveLength(STORAGE_LIST_PAGE_SIZE + 5);
		expect(calls).toEqual(["user-1", "user-1"]);
	});
});
