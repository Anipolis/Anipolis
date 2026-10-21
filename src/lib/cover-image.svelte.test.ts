import { describe, expect, it } from "vitest";
import { coverThumbFallback, coverThumbSrc } from "./cover-image";

const FULL = "https://example.supabase.co/storage/v1/object/public/anime-covers/1158.avif";
const THUMB = "https://example.supabase.co/storage/v1/object/public/anime-covers/thumbs/160/1158.avif";

function createImage(src: string) {
	const img = document.createElement("img");
	img.setAttribute("src", src);
	return img;
}

describe("coverThumbSrc", () => {
	it("uses the thumbnail for anime-covers URLs and keeps other URLs", () => {
		expect(coverThumbSrc(FULL)).toBe(THUMB);
		expect(coverThumbSrc("https://cdn.example.com/cover.jpg")).toBe("https://cdn.example.com/cover.jpg");
	});
});

describe("coverThumbFallback", () => {
	it("switches to the full cover when the thumbnail fails to load", () => {
		const img = createImage(THUMB);
		coverThumbFallback(FULL)(img);
		img.dispatchEvent(new Event("error"));
		expect(img.getAttribute("src")).toBe(FULL);
	});

	it("does not retry when the full cover itself fails", () => {
		const img = createImage(FULL);
		coverThumbFallback(FULL)(img);
		img.dispatchEvent(new Event("error"));
		expect(img.getAttribute("src")).toBe(FULL);
	});

	it("recovers a thumbnail that already failed before the attachment ran", () => {
		const img = createImage(THUMB);
		Object.defineProperty(img, "complete", { value: true });
		Object.defineProperty(img, "naturalWidth", { value: 0 });
		coverThumbFallback(FULL)(img);
		expect(img.getAttribute("src")).toBe(FULL);
	});

	it("stops listening after cleanup", () => {
		const img = createImage(THUMB);
		const cleanup = coverThumbFallback(FULL)(img);
		if (typeof cleanup === "function") cleanup();
		img.dispatchEvent(new Event("error"));
		expect(img.getAttribute("src")).toBe(THUMB);
	});
});
