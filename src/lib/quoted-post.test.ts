import { describe, expect, it } from "vitest";
import { quotedPostPlaceholder } from "./quoted-post";

const base = { content: "", image_urls: [] as string[], anime_id: null, anime: null, quoted_post_id: null };

describe("quotedPostPlaceholder（#290）", () => {
	it("本文があればラベルは出さない", () => {
		expect(quotedPostPlaceholder({ ...base, content: "こんにちは", image_urls: ["a"] })).toBeNull();
	});

	it("画像だけの投稿は枚数を添える（通知 #279 と同じ言い方）", () => {
		expect(quotedPostPlaceholder({ ...base, image_urls: ["a"] })).toBe("画像の投稿");
		expect(quotedPostPlaceholder({ ...base, content: "  \n", image_urls: ["a", "b", "c"] })).toBe("画像3枚の投稿");
	});

	it("作品引用・画像の組み合わせと、引用リポストだけの投稿", () => {
		expect(quotedPostPlaceholder({ ...base, anime_id: "7", anime: { id: "7", title: "x" } })).toBe(
			"作品引用の投稿",
		);
		expect(quotedPostPlaceholder({ ...base, image_urls: ["a", "b"], anime_id: "7", anime: null })).toBe(
			"画像2枚・作品引用の投稿",
		);
		expect(quotedPostPlaceholder({ ...base, quoted_post_id: "p" })).toBe("引用リポスト");
	});

	it("何も無くても空にしない", () => {
		expect(quotedPostPlaceholder(base)).toBe("投稿を表示");
	});
});
