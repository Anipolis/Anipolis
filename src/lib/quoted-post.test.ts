import { describe, expect, it } from "vitest";
import { quotedPostPlaceholder } from "./quoted-post";

const base = { content: "", image_urls: [] as string[], anime_id: null, anime: null, quoted_post_id: null };

describe("quotedPostPlaceholder（#290）", () => {
	it("本文があればラベルは出さない", () => {
		expect(quotedPostPlaceholder({ ...base, content: "こんにちは", image_urls: ["a"] })).toBeNull();
	});

	it("縮小画像か作品名が見えていればラベルは出さない", () => {
		expect(quotedPostPlaceholder({ ...base, image_urls: ["a"] })).toBeNull();
		expect(quotedPostPlaceholder({ ...base, content: "  \n", image_urls: ["a", "b", "c"] })).toBeNull();
		expect(quotedPostPlaceholder({ ...base, anime_id: "7", anime: { id: "7", title: "x" } })).toBeNull();
	});

	it("作品名が取れなかった作品引用と、引用リポストだけの投稿", () => {
		expect(quotedPostPlaceholder({ ...base, anime_id: "7", anime: null })).toBe("作品引用の投稿");
		expect(quotedPostPlaceholder({ ...base, quoted_post_id: "p" })).toBe("引用リポスト");
	});

	it("何も無くても空にしない", () => {
		expect(quotedPostPlaceholder(base)).toBe("投稿を表示");
	});
});
