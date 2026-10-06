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
		broadcast_station: null,
		broadcast_duration_minutes: 30,
		title_yomi: null,
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

	it("translates genres that an older importer stored in English", () => {
		const jikan = source("jikan", {
			title_ja: "炎炎ノ消防隊",
			genre: ["アクション", "Urban Fantasy", "少年向け"],
			genre_en: ["Action", "Urban Fantasy", "Shounen"],
		});

		const resolved = resolveAnimeCatalog([jikan]);

		expect(resolved.canonical.genre).toEqual(["アクション", "現代ファンタジー", "少年向け"]);
		expect(resolved.canonical.genre_en).toEqual(["Action", "Urban Fantasy", "Shounen"]);
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

	it("does not trust the offline-database episode total while a show is airing", () => {
		const airing = resolveAnimeCatalog([
			source("anime_offline_database", { title: "長期作品", episode_count: "128", status: "airing" }),
			source("mal", { title_ja: "ながいさくひん", status: "airing" }),
		]);
		expect(airing.canonical.episode_count).toBeNull();
		// MALが総話数を出していれば放送中でも採用する
		const announced = resolveAnimeCatalog([
			source("anime_offline_database", { title: "長期作品", episode_count: "128", status: "airing" }),
			source("mal", { title_ja: "ながいさくひん", status: "airing", episode_count: "24" }),
		]);
		expect(announced.canonical.episode_count).toBe("24");
		// 放送終了後はスナップショット値で問題ない
		const finished = resolveAnimeCatalog([
			source("anime_offline_database", { title: "長期作品", episode_count: "128", status: "finished" }),
			source("mal", { title_ja: "ながいさくひん", status: "finished" }),
		]);
		expect(finished.canonical.episode_count).toBe("128");
	});

	it("does not trust the offline-database placeholder total before a show airs", () => {
		// Battle Spirits [Re] 絶界の空パターン: AODB=1（暫定）、MAL=未定（num_episodes 0 → 取り込まれない）
		const resolved = resolveAnimeCatalog(
			[
				source("anime_offline_database", {
					title: "Example",
					episode_count: "1",
					status: "upcoming",
					type: "TV",
				}),
				source("mal", { title_ja: "例の作品", status: "upcoming", aired_from: "2999-10-06" }),
			],
			{ ...legacy([]), status: "upcoming", episode_count: "1" },
		);
		expect(resolved.canonical.episode_count).toBeNull();
		// MALが総話数を出していれば採用する
		const announced = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", episode_count: "1", status: "upcoming", type: "TV" }),
			source("mal", { title_ja: "例の作品", status: "upcoming", aired_from: "2999-10-06", episode_count: "12" }),
		]);
		expect(announced.canonical.episode_count).toBe("12");
		// 放送前でも告知済みの話数（12）や OVA の「1」は正当なので残す
		const preannounced = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", episode_count: "12", status: "upcoming", type: "TV" }),
			source("mal", { title_ja: "例の作品", status: "upcoming", aired_from: "2999-10-06" }),
		]);
		expect(preannounced.canonical.episode_count).toBe("12");
		const ova = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", episode_count: "1", status: "upcoming", type: "OVA" }),
			source("mal", { title_ja: "例の作品", status: "upcoming", aired_from: "2999-10-06" }),
		]);
		expect(ova.canonical.episode_count).toBe("1");
	});

	it("replaces a stale pre-air placeholder with MAL's total after the show ends", () => {
		// 天幕のジャードゥーガル パターン: 放送前に取り込んだ AODB=1 が終了後も残り、MAL=12
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", episode_count: "1", status: "upcoming", type: "TV" }),
			source("mal", {
				title_ja: "例の作品",
				status: "finished",
				aired_from: "2020-07-04",
				aired_to: "2020-09-12",
				episode_count: "12",
			}),
		]);
		expect(resolved.canonical.episode_count).toBe("12");
		expect(resolved.fieldSources["episode_count"]?.source).toBe("mal");
	});

	it("prefers Syobocal's confirmed final episode total over other sources but not manual edits", () => {
		const offline = source("anime_offline_database", { title: "Example", episode_count: "13", status: "finished" });
		const records = [
			offline,
			source("mal", { title_ja: "例の作品", status: "finished", episode_count: "13" }),
			source("syobocal", { title_ja: "例の作品", episode_count: "12", episode_count_basis: "final" }),
		];
		const resolved = resolveAnimeCatalog(records);
		expect(resolved.canonical.episode_count).toBe("12");
		expect(resolved.fieldSources["episode_count"]).toEqual({ source: "syobocal", confidence: "verified" });
		// basis の無い値（放送中の登録済み最大話数等）は使わない
		const unconfirmed = resolveAnimeCatalog([
			offline,
			source("syobocal", { title_ja: "例の作品", episode_count: "12" }),
		]);
		expect(unconfirmed.canonical.episode_count).toBe("13");
		const manual = resolveAnimeCatalog([...records, source("manual", { episode_count: "14" })]);
		expect(manual.canonical.episode_count).toBe("14");
	});

	it("fills a missing official site from the inferred Syobocal work page, below existing values", () => {
		const syobocalInferred = source("syobocal", {
			official_site_url: null,
			official_site_url_inferred: "https://www.bn-pictures.co.jp/battlespirits/",
		});
		const inferred = resolveAnimeCatalog([source("mal", { title_ja: "例の作品" }), syobocalInferred], legacy([]));
		expect(inferred.canonical.official_site_url).toBe("https://www.bn-pictures.co.jp/battlespirits/");
		expect(inferred.fieldSources["official_site_url"]).toEqual({ source: "syobocal", confidence: "source" });
		// 既に入っている値（前回値）は推定で置き換えない
		const kept = resolveAnimeCatalog([source("mal", { title_ja: "例の作品" }), syobocalInferred], {
			...legacy([]),
			official_site_url: "https://dedicated.example/",
		});
		expect(kept.canonical.official_site_url).toBe("https://dedicated.example/");
		// Jikan の作品専用ドメインは推定（局・配給サイト内ページ）より優先する
		const jikan = resolveAnimeCatalog([
			source("mal", { title_ja: "例の作品" }),
			source("jikan", { official_site_url: "https://anime-sentai-daishikkaku.com/" }),
			source("syobocal", {
				official_site_url: null,
				official_site_url_inferred: "https://sh-anime.shochiku.co.jp/anime-sentai-daishikkaku/",
			}),
		]);
		expect(jikan.canonical.official_site_url).toBe("https://anime-sentai-daishikkaku.com/");
		const labeled = resolveAnimeCatalog([
			source("mal", { title_ja: "例の作品" }),
			source("jikan", { official_site_url: "https://jikan.example/" }),
			source("syobocal", {
				official_site_url: "https://labeled.example/",
				official_site_url_inferred: "https://inferred.example/",
			}),
		]);
		expect(labeled.canonical.official_site_url).toBe("https://labeled.example/");
	});

	it("fills empty official URLs from Annict without replacing other sources or existing values", () => {
		const annict = source("annict", {
			official_site_url: "https://annict-site.example/",
			official_x_url: "https://x.com/annict_example",
		});
		// 他ソースに公式URLが無い（2019年以前の作品の典型）ときだけ Annict で埋める
		const filled = resolveAnimeCatalog([source("mal", { title_ja: "例の作品" }), annict], legacy([]));
		expect(filled.canonical.official_site_url).toBe("https://annict-site.example/");
		expect(filled.canonical.official_x_url).toBe("https://x.com/annict_example");
		expect(filled.fieldSources["official_x_url"]).toEqual({ source: "annict", confidence: "source" });
		// 前回値・Jikan は置き換えない
		const kept = resolveAnimeCatalog(
			[
				source("mal", { title_ja: "例の作品" }),
				source("jikan", { official_x_url: "https://x.com/jikan" }),
				annict,
			],
			{ ...legacy([]), official_site_url: "https://dedicated.example/" },
		);
		expect(kept.canonical.official_site_url).toBe("https://dedicated.example/");
		expect(kept.canonical.official_x_url).toBe("https://x.com/jikan");
		// しょぼいの推定URL（局・配給サイト内ページ）よりは Annict の作品URLを優先する
		const overInferred = resolveAnimeCatalog([
			source("mal", { title_ja: "例の作品" }),
			source("syobocal", { official_site_url: null, official_site_url_inferred: "https://inferred.example/" }),
			annict,
		]);
		expect(overInferred.canonical.official_site_url).toBe("https://annict-site.example/");
	});

	it("prefers MAL's total over an offline snapshot taken before the show finished", () => {
		// 転スラ第4期パターン: AODB は放送中スナップショットの 12、MAL は終了後の 24
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", episode_count: "12", status: "airing" }),
			source("mal", {
				title_ja: "例の作品",
				aired_from: "2020-04-03",
				aired_to: "2020-09-25",
				episode_count: "24",
			}),
		]);
		expect(resolved.canonical.episode_count).toBe("24");
		// AODB 自身が終了を見た値はこれまでどおり優先する
		const settled = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", episode_count: "10", status: "finished" }),
			source("mal", { title_ja: "例の作品", episode_count: "11" }),
		]);
		expect(settled.canonical.episode_count).toBe("10");
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

	it("replaces a stale AODB season with the MAL season when only MAL matches aired_from", () => {
		// 魔法使いの夜パターン: AODBは発表時の2026-winterのまま、実放送は11/20（fall）
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", season: "2026-winter", status: "upcoming" }),
			source("mal", { title_ja: "例の作品", season: "2026-fall", aired_from: "2026-11-20" }),
		]);
		expect(resolved.canonical.season).toBe("2026-fall");
		expect(resolved.fieldSources["season"]).toEqual({ source: "mal", confidence: "source" });
	});

	it("keeps the AODB season when aired_from is only a placeholder that matches nothing", () => {
		// 年始プレースホルダー（01-01）はどのクールとも矛盾しうるが、代替も整合しなければ据え置く
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", { title: "Example", season: "2026-fall", status: "upcoming" }),
			source("mal", { title_ja: "例の作品", season: "2026-fall", aired_from: "2026-01-01" }),
		]);
		expect(resolved.canonical.season).toBe("2026-fall");
	});

	it("applies the airing episode-count rule by dates even when the stored status is stale", () => {
		// BLEACH禍進譚パターン: 放送開始済みなのにソースレコードが upcoming のまま
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", {
				title: "Example",
				episode_count: "12",
				status: "upcoming",
				aired_from: "2020-01-01",
			}),
			source("mal", { title_ja: "例の作品", status: "upcoming", aired_from: "2020-01-01" }),
		]);
		// 日付上は放送中（from過去・to無し・finishedでない）→ AODBの固定値は使わない
		expect(resolved.canonical.episode_count).toBeNull();
	});

	it("keeps the offline episode total for a show that ended by dates despite a stale airing status", () => {
		// ちびゴジラパターン: 終了済みなのにソースレコードが airing のまま
		const resolved = resolveAnimeCatalog([
			source("anime_offline_database", {
				title: "Example",
				episode_count: "24",
				status: "airing",
				aired_from: "2020-01-01",
				aired_to: "2020-06-30",
			}),
			source("mal", { title_ja: "例の作品", status: "airing", aired_from: "2020-01-01", aired_to: "2020-06-30" }),
		]);
		expect(resolved.canonical.episode_count).toBe("24");
	});

	it("prefers Syobocal's leading-channel broadcast day/time over MAL's pre-air slot", () => {
		// 骸骨騎士様Ⅱパターン: MALはAT-X先行の月曜22:00、地上波最速はMX木曜24:00
		const resolved = resolveAnimeCatalog([
			source("syobocal", {
				title_ja: "骸骨騎士様",
				broadcast_day: 4,
				broadcast_time: "24:00",
				broadcast_station: "TOKYO MX",
			}),
			source("mal", { title_ja: "骸骨騎士様", broadcast_day: 1, broadcast_time: "22:00" }),
		]);
		expect(resolved.canonical).toMatchObject({ broadcast_day: 4, broadcast_time: "24:00" });
		expect(resolved.fieldSources["broadcast_day"]).toEqual({ source: "syobocal", confidence: "verified" });
		expect(resolved.fieldSources["broadcast_time"]).toEqual({ source: "syobocal", confidence: "verified" });
		// 主局の局名（単一文字列）は配列に持ち上げてカタログへ反映する
		expect(resolved.canonical.broadcast_station).toEqual(["TOKYO MX"]);
		expect(resolved.fieldSources["broadcast_station"]).toEqual({ source: "syobocal", confidence: "verified" });
	});

	it("keeps a manual broadcast station list above Syobocal's leading channel", () => {
		const resolved = resolveAnimeCatalog([
			source("manual", { broadcast_station: ["テレビ東京", "BSテレ東"] }),
			source("syobocal", { title_ja: "作品", broadcast_station: "テレビ東京" }),
		]);
		expect(resolved.canonical.broadcast_station).toEqual(["テレビ東京", "BSテレ東"]);
		expect(resolved.fieldSources["broadcast_station"]).toEqual({ source: "manual", confidence: "verified" });
	});

	it("clears the broadcast station when manual stores an explicit null", () => {
		const resolved = resolveAnimeCatalog([
			source("manual", { broadcast_station: null }),
			source("syobocal", { title_ja: "作品", broadcast_station: "テレビ東京" }),
		]);
		expect(resolved.canonical.broadcast_station).toBeNull();
		expect(resolved.fieldSources["broadcast_station"]).toEqual({ source: "manual", confidence: "verified" });
	});

	it("adopts the Syobocal leading-channel slot length and title yomi", () => {
		const resolved = resolveAnimeCatalog([
			source("syobocal", { title_ja: "作品", broadcast_duration_minutes: 15, title_yomi: "さくひん" }),
			source("mal", { title_ja: "作品", episode_duration_minutes: 24 }),
		]);
		expect(resolved.canonical.broadcast_duration_minutes).toBe(15);
		expect(resolved.fieldSources["broadcast_duration_minutes"]).toEqual({
			source: "syobocal",
			confidence: "verified",
		});
		expect(resolved.canonical.title_yomi).toBe("さくひん");
		expect(resolved.fieldSources["title_yomi"]).toEqual({ source: "syobocal", confidence: "verified" });
	});

	it("does not treat MAL's full-length episode runtime as the broadcast slot length", () => {
		// MALのepisode_duration_minutesは本編尺(24分等)で30分枠の枠長ではない
		const resolved = resolveAnimeCatalog([source("mal", { title_ja: "作品", episode_duration_minutes: 24 })]);
		expect(resolved.canonical.broadcast_duration_minutes).toBe(30);
		expect(resolved.fieldSources["broadcast_duration_minutes"]).toEqual({
			source: "legacy",
			confidence: "fallback",
		});
	});

	it("uses MAL's runtime as the slot length for short anime", () => {
		const resolved = resolveAnimeCatalog([source("mal", { title_ja: "短編", episode_duration_minutes: 4 })]);
		expect(resolved.canonical.broadcast_duration_minutes).toBe(4);
		expect(resolved.fieldSources["broadcast_duration_minutes"]).toEqual({ source: "mal", confidence: "source" });
	});

	it("keeps a manual broadcast duration above Syobocal and MAL", () => {
		const resolved = resolveAnimeCatalog([
			source("manual", { broadcast_duration_minutes: 60 }),
			source("syobocal", { title_ja: "作品", broadcast_duration_minutes: 30 }),
			source("mal", { title_ja: "作品", episode_duration_minutes: 5 }),
		]);
		expect(resolved.canonical.broadcast_duration_minutes).toBe(60);
		expect(resolved.fieldSources["broadcast_duration_minutes"]).toEqual({
			source: "manual",
			confidence: "verified",
		});
	});

	it("preserves a pre-capture hand-entered station via the legacy row when Syobocal has none", () => {
		// migration 124 以前の管理画面入力は anime 行にしか残っていない
		const legacyRow = legacy([]);
		legacyRow.broadcast_station = ["TOKYO MX", "BS11"];
		const resolved = resolveAnimeCatalog([source("syobocal", { title_ja: "作品", broadcast_day: 4 })], legacyRow);
		expect(resolved.canonical.broadcast_station).toEqual(["TOKYO MX", "BS11"]);
		expect(resolved.fieldSources["broadcast_station"]).toEqual({ source: "legacy", confidence: "fallback" });
	});

	it("keeps manual broadcast fields above Syobocal", () => {
		const resolved = resolveAnimeCatalog([
			source("manual", { broadcast_day: 0, broadcast_time: "09:00" }),
			source("syobocal", { title_ja: "作品", broadcast_day: 4, broadcast_time: "24:00" }),
		]);
		expect(resolved.canonical).toMatchObject({ broadcast_day: 0, broadcast_time: "09:00" });
		expect(resolved.fieldSources["broadcast_day"]).toEqual({ source: "manual", confidence: "verified" });
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
