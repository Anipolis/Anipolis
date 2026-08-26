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
		expect(first.canonical.resources).toEqual([]);
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

	it("rejects native-language titles smuggled into MAL's Japanese-title field", () => {
		// 韓国作品: MALのja欄にハングル題
		const korean = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Hello Carbot", status: "finished" }),
			source("mal", { title_ja: "헬로 카봇 시즌8", type: "TV" }),
		]);
		expect(korean.canonical.metadata_ready).toBe(false);
		// 中国作品: かな無しの中文題・日本側ソースの裏付けなし
		const donghua = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Ya She", status: "finished" }),
			source("mal", { title_ja: "哑舍", type: "ONA" }),
		]);
		expect(donghua.canonical.metadata_ready).toBe(false);
		// 日本放送あり: しょぼいマッピングが裏付けになり、かな無し題でも公開
		const broadcast = resolveAnimeCatalog([
			source("mal", { title_ja: "天官賜福", type: "ONA" }),
			source("syobocal", { official_site_url: "https://example.jp/" }),
		]);
		expect(broadcast.canonical.metadata_ready).toBe(true);
		expect(broadcast.canonical.title).toBe("天官賜福");
	});

	it("never publishes Music/PV/CM entries even with a verified title", () => {
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example MV", type: "Special", status: "finished" }),
			source("mal", { title_ja: "検証済みのMVタイトル", type: "Music" }),
		]);
		expect(resolved.resolutionStatus).toBe("verified");
		expect(resolved.canonical.metadata_ready).toBe(false);
		expect(resolved.resolutionReasons).toContain("Music/PV/CM entries are not published.");
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
		expect(resolved.canonical.resources).toEqual([]);
	});

	it("publishes only verified Wikipedia as a work resource", () => {
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

	it("ranks the official MAL API above Jikan and below confirmed Japanese sources", () => {
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", status: "finished" }),
			source("jikan", { title_ja: "Jikanタイトル", title_en: "Jikan English" }),
			source("mal", { title_ja: "MAL公式タイトル", title_en: "MAL English" }),
			source("syobocal", { title_ja: "しょぼいカレンダー正式タイトル" }),
		]);

		expect(resolved.canonical.title).toBe("しょぼいカレンダー正式タイトル");
		expect(resolved.canonical.title_en).toBe("MAL English");
		expect(resolved.fieldSources["title_en"]).toEqual({ source: "mal", confidence: "source" });
	});

	it("marks resolution verified when MAL supplies the only Japanese title", () => {
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", status: "finished" }),
			source("mal", { title_ja: "MAL公式タイトル" }),
		]);

		expect(resolved.canonical.title).toBe("MAL公式タイトル");
		expect(resolved.canonical.metadata_ready).toBe(true);
		expect(resolved.fieldSources["title"]).toEqual({ source: "mal", confidence: "verified" });
	});

	it("does not let a sparse MAL record shadow Jikan values it lacks", () => {
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", status: "finished" }),
			source("jikan", {
				title_ja: "Jikanタイトル",
				official_site_url: "https://official.example/anime",
				studio: ["マッドハウス"],
				broadcast_day: 5,
			}),
			source("mal", { title_ja: "MAL公式タイトル", studio_en: ["MADHOUSE"] }),
		]);

		expect(resolved.canonical.title).toBe("MAL公式タイトル");
		expect(resolved.canonical.official_site_url).toBe("https://official.example/anime");
		expect(resolved.canonical.broadcast_day).toBe(5);
		expect(resolved.fieldSources["broadcast_day"]?.source).toBe("jikan");
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
