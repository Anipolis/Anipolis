import { describe, expect, it } from "vitest";
import { parseComposeDraft } from "./compose-draft";
import {
	isPostImageUsable,
	POST_IMAGE_SWEEP_AFTER_MS,
	POST_IMAGE_UNPOSTED_TTL_MS,
	postImageUploadedAt,
	shouldSweepPostImage,
} from "./post-image-lifetime";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 13, 12, 0, 0);
const UUID = "0b7c6a8e-5d4f-4a3b-9c2d-1e0f9a8b7c6d";
const path = (uploadedAt: number) => `user-1/${uploadedAt}-${UUID}.png`;
const url = (uploadedAt: number) =>
	`https://project.supabase.co/storage/v1/object/public/post-images/${path(uploadedAt)}`;

describe("投稿していない画像の使用期限（#330）", () => {
	it("サーバーが付けたファイル名からアップロード時刻を読む。旧形式は読めない", () => {
		expect(postImageUploadedAt(url(now))).toBe(now);
		expect(postImageUploadedAt(`${url(now)}?v=1`)).toBe(now);
		expect(postImageUploadedAt("user-1/1776610250342.jpg")).toBeNull();
	});

	it("アップロードから7日までは使え、過ぎたら使えない（時刻が読めなければ使える扱い）", () => {
		expect(isPostImageUsable(url(now - POST_IMAGE_UNPOSTED_TTL_MS), now)).toBe(true);
		expect(isPostImageUsable(url(now - POST_IMAGE_UNPOSTED_TTL_MS - 1), now)).toBe(false);
		expect(isPostImageUsable("user-1/1776610250342.jpg", now)).toBe(true);
	});

	it("回収は、どの投稿にも使われず使用期限より長い8日を過ぎたものだけ", () => {
		const old = now - POST_IMAGE_SWEEP_AFTER_MS - 1;
		expect(shouldSweepPostImage(path(old), now, new Set(), now)).toBe(true);
		expect(shouldSweepPostImage(path(old), now, new Set([path(old)]), now)).toBe(false);
		expect(shouldSweepPostImage(path(now - 7.5 * DAY), now, new Set(), now)).toBe(false);
		// 旧形式は Storage の作成日時で判断する
		expect(shouldSweepPostImage("user-1/1776610250342.jpg", now - 9 * DAY, new Set(), now)).toBe(true);
	});

	it("9日前に付けた画像の下書きを昨日編集しても、その画像は復元されない（回収と食い違わない）", () => {
		const nineDaysAgo = now - 9 * DAY;
		const fresh = url(now - DAY);
		const draft = parseComposeDraft(
			JSON.stringify({
				v: 1,
				savedAt: now - DAY, // 下書き自体はまだ有効
				content: "書きかけ",
				imageUrls: [url(nineDaysAgo), fresh],
				anime: null,
				cwAnime: null,
				room: null,
			}),
			now,
		);
		expect(draft?.imageUrls).toEqual([fresh]);
		// 外した画像は回収の対象、残した画像は対象外
		expect(shouldSweepPostImage(path(nineDaysAgo), nineDaysAgo, new Set(), now)).toBe(true);
		expect(shouldSweepPostImage(path(now - DAY), now - DAY, new Set(), now)).toBe(false);
	});
});
