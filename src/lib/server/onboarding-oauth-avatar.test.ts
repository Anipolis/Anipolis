import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { completeProfileSetupAction } from "./actions";

const PNG = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
	(c) => c.charCodeAt(0),
);
const DISCORD_AVATAR = "https://cdn.discordapp.com/avatars/1/a.png";

function fakeSupabase() {
	const uploads: { path: string; contentType: string }[] = [];
	const inserts: unknown[] = [];
	const client = {
		storage: {
			from: vi.fn(() => ({
				list: vi.fn(async () => ({ data: [], error: null })),
				upload: vi.fn(async (path: string, _bytes: ArrayBuffer, options: { contentType: string }) => {
					uploads.push({ path, contentType: options.contentType });
					return { data: { path }, error: null };
				}),
				getPublicUrl: vi.fn((path: string) => ({
					data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/profile-avatars/${path}` },
				})),
				remove: vi.fn(async () => ({ error: null })),
			})),
		},
		from: vi.fn(() => ({
			insert: vi.fn(async (row: unknown) => {
				inserts.push(row);
				return { error: null };
			}),
		})),
	};
	return { client: client as unknown as SupabaseClient<Database>, uploads, inserts };
}

function oauthForm() {
	const form = new FormData();
	form.set("username", "animetaro");
	form.set("display_name", "アニメ太郎");
	form.set("avatar_choice", "oauth");
	return form;
}

describe("completeProfileSetupAction の OAuth 画像", () => {
	it("外部 URL を保存せず、自前の Storage に取り込んだ URL を保存する", async () => {
		const supabase = fakeSupabase();
		const fetchFn = vi.fn(async () => new Response(PNG, { status: 200 }));

		const result = await completeProfileSetupAction(oauthForm(), supabase.client, "user-1", {
			oauthAvatarUrl: DISCORD_AVATAR,
			fetchFn,
		});

		expect(result).toEqual({ success: true });
		expect(supabase.uploads).toEqual([
			{ path: expect.stringMatching(/^user-1\/avatar_\d+\.png$/), contentType: "image/png" },
		]);
		expect(supabase.inserts).toEqual([
			expect.objectContaining({
				avatar_url: expect.stringMatching(/\/profile-avatars\/user-1\/avatar_\d+\.png$/),
			}),
		]);
		expect(JSON.stringify(supabase.inserts)).not.toContain("cdn.discordapp.com");
	});

	it("画像を取得できなければ、画像なしでプロフィールを作る", async () => {
		const supabase = fakeSupabase();
		const fetchFn = vi.fn(async () => new Response("unavailable", { status: 503 }));

		const result = await completeProfileSetupAction(oauthForm(), supabase.client, "user-1", {
			oauthAvatarUrl: DISCORD_AVATAR,
			fetchFn,
		});

		expect(result).toEqual({ success: true });
		expect(supabase.uploads).toEqual([]);
		expect(supabase.inserts).toEqual([expect.objectContaining({ avatar_url: null })]);
	});

	it("取り込み対象外の URL は取得せず、そのまま保存もしない", async () => {
		const supabase = fakeSupabase();
		const fetchFn = vi.fn();

		await completeProfileSetupAction(oauthForm(), supabase.client, "user-1", {
			oauthAvatarUrl: "https://example.com/a.png",
			fetchFn,
		});

		expect(fetchFn).not.toHaveBeenCalled();
		expect(supabase.inserts).toEqual([expect.objectContaining({ avatar_url: null })]);
	});
});
