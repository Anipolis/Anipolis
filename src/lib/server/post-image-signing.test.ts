import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import {
	clearPostImageSignatureCache,
	POST_IMAGE_SIGNED_URL_TTL_SECONDS,
	signPostImageUrls,
} from "./post-image-signing";

const stored = (name: string) => `https://project.supabase.co/storage/v1/object/public/post-images/user-1/${name}`;

function fakeClient(fail = false) {
	const createSignedUrls = vi.fn(async (paths: string[], expiresIn: number) =>
		fail
			? { data: null, error: { message: "unavailable" } }
			: {
					data: paths.map((path) => ({
						path,
						signedUrl: `https://signed/${path}?exp=${expiresIn}`,
						error: null,
					})),
					error: null,
				},
	);
	const client = { storage: { from: () => ({ createSignedUrls }) } } as unknown as SupabaseClient<Database>;
	return { client, createSignedUrls };
}

beforeEach(() => clearPostImageSignatureCache());

describe("signPostImageUrls（#316）", () => {
	it("まとめて1時間の期限付き URL を発行する", async () => {
		const { client, createSignedUrls } = fakeClient();
		const result = await signPostImageUrls([stored("a.png"), stored("b.png"), stored("a.png")], client);
		expect(createSignedUrls).toHaveBeenCalledWith(
			["user-1/a.png", "user-1/b.png"],
			POST_IMAGE_SIGNED_URL_TTL_SECONDS,
		);
		expect(result.get(stored("a.png"))).toBe(
			`https://signed/user-1/a.png?exp=${POST_IMAGE_SIGNED_URL_TTL_SECONDS}`,
		);
	});

	it("期限まで十分残っている URL は使い回し、ブラウザのキャッシュが効くようにする", async () => {
		const { client, createSignedUrls } = fakeClient();
		const now = Date.now();
		const first = await signPostImageUrls([stored("a.png")], client, now);
		const again = await signPostImageUrls([stored("a.png")], client, now + 30 * 60 * 1000);
		expect(again.get(stored("a.png"))).toBe(first.get(stored("a.png")));
		expect(createSignedUrls).toHaveBeenCalledTimes(1);
		// 残りが短くなったら発行し直す
		await signPostImageUrls([stored("a.png")], client, now + 50 * 60 * 1000);
		expect(createSignedUrls).toHaveBeenCalledTimes(2);
	});

	it("発行に失敗したら、閲覧権限を確かめて転送する固定リンクにする", async () => {
		const { client } = fakeClient(true);
		const result = await signPostImageUrls([stored("a.png")], client);
		expect(result.get(stored("a.png"))).toBe("/api/media/post-images/user-1/a.png");
	});

	it("投稿画像の形式でない URL はそのまま", async () => {
		const { client, createSignedUrls } = fakeClient();
		const result = await signPostImageUrls(["/anipolis-logo-light.png"], client);
		expect(result.get("/anipolis-logo-light.png")).toBe("/anipolis-logo-light.png");
		expect(createSignedUrls).not.toHaveBeenCalled();
	});
});
