import { describe, expect, it } from "vitest";
import { animeOgObjectName, animeOgPublicUrl, canRenderAnimeOg } from "./anime-og";

const BASE = "https://example.supabase.co/storage/v1/object/public/anime-covers/";
const anime = {
	title: "作品A",
	cover_url: `${BASE}mal-1-abc.avif`,
	copyright: "©作品A製作委員会",
	season: "2026-fall",
	type: "TV",
};

describe("anime og card naming", () => {
	it("needs a cover in the bucket and a copyright notice", () => {
		expect(canRenderAnimeOg(anime)).toBe(true);
		expect(canRenderAnimeOg({ ...anime, copyright: "  " })).toBe(false);
		expect(canRenderAnimeOg({ ...anime, cover_url: null })).toBe(false);
		expect(canRenderAnimeOg({ ...anime, cover_url: "https://cdn.example/a.jpg" })).toBe(false);
	});

	it("names the card after the cover and a hash of the text on it", () => {
		const name = animeOgObjectName(anime);
		expect(name).toMatch(/^og\/mal-1-abc-[0-9a-f]{8}\.jpg$/);
		expect(animeOgObjectName({ ...anime })).toBe(name);
		expect(animeOgObjectName({ ...anime, copyright: "©別の表記" })).not.toBe(name);
		expect(animeOgObjectName({ ...anime, title: "作品A（改題）" })).not.toBe(name);
	});

	it("builds the public url in the same bucket", () => {
		expect(animeOgPublicUrl(anime)).toBe(`${BASE}${animeOgObjectName(anime)}`);
		expect(animeOgPublicUrl({ ...anime, copyright: null })).toBeNull();
	});
});
