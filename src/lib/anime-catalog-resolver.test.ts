import { describe, expect, it } from "vitest";
import {
	type CatalogSourceRecord,
	type LegacyAnimeCatalogRow,
	resolveAnimeCatalog,
	selectVerifiedRomajiCandidate,
} from "./anime-catalog-resolver";

function source(name: CatalogSourceRecord["source"], normalizedData: Record<string, unknown>): CatalogSourceRecord {
	return {
		mal_id: 43760,
		source: name,
		source_url: `https://example.com/${name}`,
		normalized_data: normalizedData,
	};
}

function legacy(resources: { name: string; url: string }[]): LegacyAnimeCatalogRow {
	return {
		mal_id: 43760,
		title: "Legacy title",
		title_en: null,
		title_romaji: null,
		episode_count: null,
		type: null,
		status: "finished",
		aired_from: null,
		aired_to: null,
		season: "2023-winter",
		source: null,
		studio: null,
		studio_en: null,
		genre: null,
		genre_en: null,
		broadcast_day: null,
		broadcast_time: null,
		official_site_url: null,
		official_x_url: null,
		resources,
		cover_url: null,
	};
}

describe("resolveAnimeCatalog", () => {
	it("uses sources by field instead of importer execution order", () => {
		const offline = source("anime_offline_database", {
			title: "Hikari no Ou",
			episode_count: "10",
			type: "TV",
			status: "finished",
			season: "2023-winter",
			studios: ["signal.md"],
		});
		const wikidata = source("wikidata", {
			title_ja: "火狩りの王 第1期",
			title_en: "The Fire Hunter, season 1",
			title_en_aliases: ["Hikari no Ou, season 1"],
		});
		const jikan = source("jikan", {
			title_ja: "火狩りの王",
			title_en: "The Fire Hunter",
			title_romaji: "Hikari no Ou",
			studio: ["シグナル・エムディ"],
			studio_en: ["Signal.MD"],
		});

		const first = resolveAnimeCatalog([offline, wikidata, jikan]);
		const second = resolveAnimeCatalog([jikan, offline, wikidata]);

		expect(first).toEqual(second);
		expect(first.canonical).toMatchObject({
			title: "火狩りの王 第1期",
			title_en: "The Fire Hunter",
			title_romaji: "Hikari no Ou",
			studio: ["シグナル・エムディ"],
			studio_en: ["Signal.MD"],
			episode_count: "10",
			metadata_ready: true,
		});
		expect(first.fieldSources["studio"]).toEqual({ source: "jikan", confidence: "source" });
		expect(first.canonical.resources).toEqual([
			{ name: "anime-offline-database", url: "https://example.com/anime_offline_database" },
			{ name: "Wikidata", url: "https://example.com/wikidata" },
		]);
	});

	it("keeps unresolved ODbL metadata as draft instead of publishing inferred titles", () => {
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", {
				title: "Hikari no Ou",
				season: "2023-winter",
				status: "finished",
				studios: ["signal.md"],
			}),
		]);

		expect(resolved.canonical.title).toBe("Hikari no Ou");
		expect(resolved.canonical.metadata_ready).toBe(false);
		expect(resolved.resolutionStatus).toBe("unverified");
	});

	it("deduplicates unresolved studio spelling variants by normalized alias", () => {
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", {
				title: "Example",
				season: "2023-winter",
				status: "finished",
				studios: ["geek toys inc.", "geektoys"],
			}),
		]);

		expect(resolved.canonical.studio).toEqual(["geek toys inc."]);
		expect(resolved.canonical.studio_en).toEqual(["geek toys inc."]);
	});

	it("lets manual values override every imported source", () => {
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Hikari no Ou", status: "finished" }),
			source("wikidata", { title_ja: "火狩りの王" }),
			source("manual", { title: "火狩りの王（確認済み）", studio: ["手動スタジオ"] }),
		]);

		expect(resolved.canonical.title).toBe("火狩りの王（確認済み）");
		expect(resolved.canonical.studio).toEqual(["手動スタジオ"]);
		expect(resolved.fieldSources["title"]?.source).toBe("manual");
	});

	it("uses a confirmed Syobocal title and official links ahead of other imported sources", () => {
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", status: "finished" }),
			source("wikidata", { title_ja: "別の検証済みタイトル" }),
			source("jikan", {
				title_ja: "Jikanタイトル",
				official_site_url: "https://jikan.example/anime",
			}),
			source("syobocal", {
				title_ja: "しょぼいカレンダー正式タイトル",
				official_site_url: "https://official.example/anime",
				official_x_url: "https://x.com/example",
				resources: [{ name: "公式", url: "https://official.example/anime" }],
			}),
		]);

		expect(resolved.canonical).toMatchObject({
			title: "しょぼいカレンダー正式タイトル",
			official_site_url: "https://official.example/anime",
			official_x_url: "https://x.com/example",
			metadata_ready: true,
		});
		expect(resolved.fieldSources["title"]).toEqual({ source: "syobocal", confidence: "verified" });
		expect(resolved.fieldSources["official_site_url"]).toEqual({
			source: "syobocal",
			confidence: "verified",
		});
		expect(resolved.canonical.resources).toContainEqual({
			name: "しょぼいカレンダー",
			url: "https://example.com/syobocal",
		});
	});

	it("publishes only verified Wikipedia and provenance resources", () => {
		const resolved = resolveAnimeCatalog(
			[
				source("anime_offline_database", { title: "Example", status: "finished" }),
				source("jikan", {
					resources: [{ name: "Streaming", url: "https://stream.example/anime" }],
				}),
				source("syobocal", {
					resources: [
						{ name: "AT-X", url: "https://www.at-x.com/program/detail/1" },
						{ name: "Wikipedia", url: "https://ja.wikipedia.org/wiki/Example" },
						{ name: "Wikipedia", url: "https://example.com/not-wikipedia" },
					],
				}),
			],
			legacy([{ name: "テレビ東京", url: "https://www.tv-tokyo.co.jp/anime/example" }]),
		);

		expect(resolved.canonical.resources).toEqual([
			{ name: "anime-offline-database", url: "https://example.com/anime_offline_database" },
			{ name: "しょぼいカレンダー", url: "https://example.com/syobocal" },
			{ name: "Wikipedia", url: "https://ja.wikipedia.org/wiki/Example" },
		]);
	});

	it("resolves corporate studio aliases through a stable Wikidata identity", () => {
		const resolved = resolveAnimeCatalog(
			[
				source("anime_offline_database", {
					title: "Tsunlise",
					status: "finished",
					studios: ["tezuka productions co., ltd.", "Tezuka Productions"],
				}),
			],
			undefined,
			() => ({
				sourceKey: "Q2090847",
				nameJa: "手塚プロダクション",
				nameEn: "Tezuka Productions",
				sourceUrl: "https://www.wikidata.org/wiki/Q2090847",
			}),
		);

		expect(resolved.canonical.studio).toEqual(["手塚プロダクション"]);
		expect(resolved.canonical.studio_en).toEqual(["Tezuka Productions"]);
		expect(resolved.fieldSources["studio"]).toEqual({ source: "wikidata", confidence: "verified" });
	});
});

describe("selectVerifiedRomajiCandidate", () => {
	it("validates the ODbL title against Wikidata transliteration aliases", () => {
		expect(
			selectVerifiedRomajiCandidate("Hikari no Ou", "The Fire Hunter", [
				"Hikari no Ō, season 1",
				"Hikari no Ou, season 1",
			]),
		).toBe("Hikari no Ou");
		expect(selectVerifiedRomajiCandidate("The Fire Hunter", "The Fire Hunter", ["Hikari no Ou"])).toBeUndefined();
	});
});
