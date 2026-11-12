import { describe, expect, it } from "vitest";
import { canonicalUrl, metaText, postMetaDescription, shareText, toAbsoluteUrl, xIntentUrl } from "./seo";

describe("seo helpers", () => {
	it("makes og:image absolute", () => {
		expect(toAbsoluteUrl("/og-default.png", "https://anipolis.net")).toBe("https://anipolis.net/og-default.png");
		expect(toAbsoluteUrl("https://cdn.example/a.avif", "https://anipolis.net")).toBe("https://cdn.example/a.avif");
	});

	it("drops query and hash from the canonical url", () => {
		expect(canonicalUrl(new URL("https://anipolis.net/anime/1?tab=posts#x"))).toBe("https://anipolis.net/anime/1");
	});

	it("collapses whitespace and truncates by characters", () => {
		expect(metaText("  一行目\n\n二行目  ")).toBe("一行目 二行目");
		expect(metaText("あ".repeat(10), 5)).toBe("ああああ…");
		expect(metaText(null)).toBe("");
	});

	it("never exposes the body of a spoiler post", () => {
		expect(postMetaDescription({ content: "犯人は○○", hasCw: true, cwAnimeTitle: "作品A", animeTitle: null })).toBe(
			"「作品A」のネタバレを含む投稿です",
		);
		expect(postMetaDescription({ content: "犯人は○○", hasCw: true, cwAnimeTitle: null, animeTitle: null })).toBe(
			"ネタバレを含む投稿です",
		);
	});

	it("falls back when a post has no text", () => {
		expect(postMetaDescription({ content: "", hasCw: false, cwAnimeTitle: null, animeTitle: "作品B" })).toBe(
			"「作品B」についての投稿",
		);
		expect(postMetaDescription({ content: "面白かった", hasCw: false, cwAnimeTitle: null, animeTitle: null })).toBe(
			"面白かった",
		);
	});

	it("builds share text and the X intent url", () => {
		expect(shareText("作品C")).toBe("作品C - Anipolis");
		expect(shareText("作品C - Anipolis")).toBe("作品C - Anipolis");
		const url = new URL(xIntentUrl("作品C - Anipolis", "https://anipolis.net/anime/1"));
		expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
		expect(url.searchParams.get("text")).toBe("作品C - Anipolis");
		expect(url.searchParams.get("url")).toBe("https://anipolis.net/anime/1");
	});
});

describe("crawlerSafeImage", () => {
	it("drops AVIF images that link previews cannot show", async () => {
		const { crawlerSafeImage } = await import("./seo");
		expect(crawlerSafeImage("https://x.supabase.co/anime-covers/a.avif")).toBeNull();
		expect(crawlerSafeImage("https://x.supabase.co/anime-covers/a.AVIF?v=2")).toBeNull();
		expect(crawlerSafeImage("https://x.supabase.co/avatars/a.webp")).toBe("https://x.supabase.co/avatars/a.webp");
		expect(crawlerSafeImage(null)).toBeNull();
	});
});
