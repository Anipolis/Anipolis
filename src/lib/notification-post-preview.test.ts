import { describe, expect, it } from "vitest";
import {
	DELETED_POST_LABEL,
	emptyPostContextLabel,
	notificationPostPreview,
	truncatePostContent,
} from "./notification-post-preview";

function fields(overrides: Partial<Parameters<typeof notificationPostPreview>[0]> = {}) {
	return {
		post_id: "post-1",
		post_available: true,
		post_content: "",
		post_image_count: 0,
		post_has_anime_quote: false,
		post_has_quoted_post: false,
		post_has_exchange_share: false,
		...overrides,
	};
}

describe("truncatePostContent", () => {
	it("keeps short content as is and trims surrounding whitespace", () => {
		expect(truncatePostContent("  こんにちは  ")).toBe("こんにちは");
	});

	it("cuts long content at the limit and appends an ellipsis", () => {
		const content = "あ".repeat(100);
		expect(truncatePostContent(content)).toBe(`${"あ".repeat(80)}…`);
	});
});

describe("emptyPostContextLabel", () => {
	it("labels an image-only post, counting multiple images", () => {
		expect(emptyPostContextLabel(fields({ post_image_count: 1 }))).toBe("画像の投稿");
		expect(emptyPostContextLabel(fields({ post_image_count: 3 }))).toBe("画像3枚の投稿");
	});

	it("labels an anime-quote-only post", () => {
		expect(emptyPostContextLabel(fields({ post_has_anime_quote: true }))).toBe("作品引用の投稿");
	});

	it("joins multiple attachments in a fixed order", () => {
		expect(
			emptyPostContextLabel(
				fields({ post_image_count: 2, post_has_anime_quote: true, post_has_exchange_share: true }),
			),
		).toBe("画像2枚・作品引用・トレード結果の投稿");
	});

	it("labels a quote repost without other attachments", () => {
		expect(emptyPostContextLabel(fields({ post_has_quoted_post: true }))).toBe("引用リポスト");
	});

	it("falls back to a generic label when nothing is known about the post", () => {
		expect(emptyPostContextLabel(fields())).toBe("投稿を表示");
	});
});

describe("notificationPostPreview", () => {
	it("returns nothing for notifications without a post", () => {
		expect(notificationPostPreview(fields({ post_id: null }))).toBeNull();
	});

	it("marks a post whose row could not be loaded as deleted without a link", () => {
		expect(notificationPostPreview(fields({ post_available: false }))).toEqual({
			kind: "deleted",
			text: DELETED_POST_LABEL,
		});
	});

	it("links to the post with a truncated excerpt when it has content", () => {
		const preview = notificationPostPreview(fields({ post_content: "い".repeat(90) }));
		expect(preview).toEqual({
			kind: "link",
			href: "/posts/post-1",
			text: `${"い".repeat(80)}…`,
			placeholder: false,
		});
	});

	it("still links to an image-only post using a context label", () => {
		expect(notificationPostPreview(fields({ post_image_count: 1 }))).toEqual({
			kind: "link",
			href: "/posts/post-1",
			text: "画像の投稿",
			placeholder: true,
		});
	});

	it("treats whitespace-only content as empty", () => {
		const preview = notificationPostPreview(fields({ post_content: " \n ", post_has_anime_quote: true }));
		expect(preview).toMatchObject({ kind: "link", text: "作品引用の投稿", placeholder: true });
	});
});
