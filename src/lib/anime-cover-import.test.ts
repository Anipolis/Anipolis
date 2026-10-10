import { describe, expect, it } from "vitest";
import { coverThumbObjectName, isCoverSourceObject } from "./anime-cover";
import {
	importedCoverObjectName,
	importedCoverSize,
	reviewImportedCover,
	selectJikanCoverImageUrl,
} from "./anime-cover-import";

const CDN = "https://cdn.myanimelist.net/images/anime/1999/139748";

describe("selectJikanCoverImageUrl", () => {
	it("prefers the large JPEG", () => {
		expect(
			selectJikanCoverImageUrl({
				jpg: { image_url: `${CDN}.jpg`, large_image_url: `${CDN}l.jpg` },
				webp: { large_image_url: `${CDN}l.webp` },
			}),
		).toBe(`${CDN}l.jpg`);
	});

	it("falls back to other sizes and WebP", () => {
		expect(selectJikanCoverImageUrl({ jpg: { image_url: `${CDN}.jpg` } })).toBe(`${CDN}.jpg`);
		expect(selectJikanCoverImageUrl({ webp: { large_image_url: `${CDN}l.webp` } })).toBe(`${CDN}l.webp`);
	});

	it("ignores MAL placeholders, other hosts and missing images", () => {
		expect(
			selectJikanCoverImageUrl({ jpg: { large_image_url: "https://cdn.myanimelist.net/images/qm_50.gif" } }),
		).toBeNull();
		expect(
			selectJikanCoverImageUrl({ jpg: { large_image_url: "https://example.com/images/anime/1/2.jpg" } }),
		).toBeNull();
		expect(selectJikanCoverImageUrl(null)).toBeNull();
		expect(selectJikanCoverImageUrl(undefined)).toBeNull();
	});
});

describe("importedCoverSize", () => {
	it("keeps MAL-sized images as they are", () => {
		expect(importedCoverSize(424, 600)).toEqual({ width: 424, height: 600 });
		expect(importedCoverSize(225, 350)).toEqual({ width: 225, height: 350 });
	});

	it("shrinks the long side to 600 without changing the ratio", () => {
		expect(importedCoverSize(1000, 1414)).toEqual({ width: 424, height: 600 });
		expect(importedCoverSize(1200, 675)).toEqual({ width: 600, height: 338 });
	});
});

describe("reviewImportedCover", () => {
	it("approves portrait covers close to the existing ratio", () => {
		expect(reviewImportedCover(424, 600)).toEqual({ status: "approved" });
		expect(reviewImportedCover(225, 350)).toEqual({ status: "approved" });
		expect(reviewImportedCover(304, 475)).toEqual({ status: "approved" });
	});

	it("holds landscape, unusual and small images for review", () => {
		expect(reviewImportedCover(600, 337)).toMatchObject({
			status: "needs_review",
			reason: expect.stringContaining("not portrait"),
		});
		expect(reviewImportedCover(300, 600)).toMatchObject({
			status: "needs_review",
			reason: expect.stringContaining("aspect"),
		});
		expect(reviewImportedCover(150, 212)).toMatchObject({
			status: "needs_review",
			reason: expect.stringContaining("small"),
		});
		expect(reviewImportedCover(0, 600)).toMatchObject({ status: "needs_review" });
	});
});

describe("importedCoverObjectName", () => {
	it("is a root-level name that follows the thumbnail convention", () => {
		const name = importedCoverObjectName(49073, "a".repeat(64));
		expect(name).toBe("mal-49073-aaaaaaaaaaaa.avif");
		expect(isCoverSourceObject(name)).toBe(true);
		expect(coverThumbObjectName(name)).toBe("thumbs/160/mal-49073-aaaaaaaaaaaa.avif");
	});
});
