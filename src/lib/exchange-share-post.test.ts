import { describe, expect, it } from "vitest";
import { type RawPost, toPost } from "$lib/types";

/** posts.exchange_share（投稿した人が書ける JSON）を付けた投稿を変換する */
function toPostWithShare(exchangeShare: unknown) {
	const raw: RawPost = {
		id: "p1",
		user_id: "u1",
		content: "交換しました",
		created_at: "2026-11-12T00:00:00Z",
		profiles: { username: "u", display_name: null, avatar_url: null },
		post_hashtags: [],
		exchange_share: exchangeShare,
	};
	return toPost(raw).exchange_share;
}

const anime = (overrides: Record<string, unknown> = {}) => ({
	id: 1129,
	title: "天は赤い河のほとり",
	cover_url: "https://cdn.example/cover.jpg",
	...overrides,
});
const share = (offered: unknown, received: unknown = anime({ id: 2 })) => ({
	type: "anime_exchange",
	offered_anime: offered,
	received_anime: received,
});

describe("toPost: exchange_share", () => {
	it("作品の ID が数字のトレード結果はそのまま通す（数値でも文字列でも）", () => {
		expect(toPostWithShare(share(anime()))?.offered_anime).toEqual({
			id: "1129",
			title: "天は赤い河のほとり",
			title_en: null,
			cover_url: "https://cdn.example/cover.jpg",
		});
		expect(toPostWithShare(share(anime({ id: "1129" })))?.offered_anime.id).toBe("1129");
	});

	it("作品の ID が数字でなければ、トレード結果ごと表示しない（リンクの行き先を書き換えさせない）", () => {
		for (const id of ["../auth?next=/%09/evil.example", "1/../../auth", "1?x=1", "1#x", " 1", "1.5", "-1", ""]) {
			expect(toPostWithShare(share(anime({ id })))).toBeNull();
			expect(toPostWithShare(share(anime(), anime({ id })))).toBeNull();
		}
	});

	it("カバーは http(s) の URL だけを通す（サイト内のパスや data: を画像として読ませない）", () => {
		for (const coverUrl of [
			"/auth/confirm?token_hash=x&type=email",
			"auth/reset-password?token_hash=x&type=recovery",
			"//evil.example/a.png",
			"data:image/png;base64,AAAA",
			"javascript:alert(1)",
		]) {
			const result = toPostWithShare(share(anime({ cover_url: coverUrl })));
			expect(result?.offered_anime.cover_url).toBeNull();
			expect(result?.offered_anime.id).toBe("1129");
		}
		expect(toPostWithShare(share(anime({ cover_url: "http://cdn.example/a.png" })))?.offered_anime.cover_url).toBe(
			"http://cdn.example/a.png",
		);
	});
});
