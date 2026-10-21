import { describe, expect, it } from "vitest";
import { coverObjectNameFromUrl, coverThumbObjectName, coverThumbUrl, isCoverSourceObject } from "./anime-cover";

const BASE = "https://example.supabase.co/storage/v1/object/public/anime-covers/";

describe("isCoverSourceObject", () => {
	it("accepts root-level image objects", () => {
		expect(isCoverSourceObject("1158.avif")).toBe(true);
		expect(isCoverSourceObject("pending_1700000000_abc.jpg")).toBe(true);
	});

	it("rejects thumbnails, folders, placeholders and names without an extension", () => {
		expect(isCoverSourceObject("thumbs/160/1158.avif")).toBe(false);
		expect(isCoverSourceObject(".emptyFolderPlaceholder")).toBe(false);
		expect(isCoverSourceObject("1158")).toBe(false);
		expect(isCoverSourceObject("")).toBe(false);
	});
});

describe("coverThumbObjectName", () => {
	it("replaces the extension with .avif under the thumbnail prefix", () => {
		expect(coverThumbObjectName("1158.avif")).toBe("thumbs/160/1158.avif");
		expect(coverThumbObjectName("pending_1_x.jpg")).toBe("thumbs/160/pending_1_x.avif");
	});
});

describe("coverObjectNameFromUrl", () => {
	it("extracts the object name and ignores query strings", () => {
		expect(coverObjectNameFromUrl(`${BASE}1158.avif`)).toBe("1158.avif");
		expect(coverObjectNameFromUrl(`${BASE}1158.avif?v=2`)).toBe("1158.avif");
	});

	it("returns null for other buckets, thumbnails and external hosts", () => {
		expect(
			coverObjectNameFromUrl("https://example.supabase.co/storage/v1/object/public/post-images/a.jpg"),
		).toBeNull();
		expect(coverObjectNameFromUrl(`${BASE}thumbs/160/1158.avif`)).toBeNull();
		expect(coverObjectNameFromUrl("https://cdn.example.com/cover.jpg")).toBeNull();
		expect(coverObjectNameFromUrl(`${BASE}%E0%A4%A.jpg`)).toBeNull();
	});
});

describe("coverThumbUrl", () => {
	it("builds the thumbnail URL on the same host", () => {
		expect(coverThumbUrl(`${BASE}1158.avif`)).toBe(`${BASE}thumbs/160/1158.avif`);
		expect(coverThumbUrl(`${BASE}5.jpg?t=1`)).toBe(`${BASE}thumbs/160/5.avif`);
	});

	it("returns null when there is no thumbnail convention for the URL", () => {
		expect(coverThumbUrl(null)).toBeNull();
		expect(coverThumbUrl(undefined)).toBeNull();
		expect(coverThumbUrl("")).toBeNull();
		expect(coverThumbUrl("blob:http://localhost/abc")).toBeNull();
	});
});
