import { describe, expect, it } from "vitest";
import {
	groupWikidataStudios,
	matchStudioNames,
	normalizeStudioAlias,
	selectCanonicalStudioNames,
} from "./wikidata-studio-names";

describe("Wikidata studio names", () => {
	it("normalizes corporate suffixes without maintaining a spelling dictionary", () => {
		expect(normalizeStudioAlias("tezuka productions co., ltd.")).toBe("tezukaproductions");
		expect(normalizeStudioAlias("Tezuka Productions Company, Limited")).toBe("tezukaproductions");
		expect(normalizeStudioAlias("Co Mix Wave Films")).toBe("comixwavefilms");
	});

	it("matches a source alias to a unique localized studio identity", () => {
		const studios = groupWikidataStudios([
			{
				item: { value: "http://www.wikidata.org/entity/Q2090847" },
				jaLabel: { value: "手塚プロダクション" },
				enLabel: { value: "Tezuka Productions" },
				enAlias: { value: "Tezuka Productions Company, Limited" },
			},
		]);
		const matches = matchStudioNames(["tezuka productions co., ltd."], studios);

		expect(matches.get("tezukaproductions")).toMatchObject({
			nameJa: "手塚プロダクション",
			nameEn: "Tezuka Productions",
			sourceKey: "Q2090847",
		});
	});

	it("does not guess when the normalized alias identifies multiple entities", () => {
		const matches = matchStudioNames(
			["Studio Example"],
			[
				{
					sourceKey: "Q1",
					sourceUrl: "https://www.wikidata.org/wiki/Q1",
					nameJa: "例1",
					nameEn: "Studio Example",
					aliases: [],
					malCompanyId: null,
				},
				{
					sourceKey: "Q2",
					sourceUrl: "https://www.wikidata.org/wiki/Q2",
					nameJa: "例2",
					nameEn: "Studio Example",
					aliases: [],
					malCompanyId: null,
				},
			],
		);
		expect(matches.size).toBe(0);
	});

	it("prefers a MAL company ID over spelling when Jikan provides the identity", () => {
		const studio = {
			sourceKey: "Q277763",
			sourceUrl: "https://www.wikidata.org/wiki/Q277763",
			nameJa: "A-1 Pictures",
			nameEn: "A-1 Pictures",
			aliases: [],
			malCompanyId: 56,
		};
		const matches = matchStudioNames([{ name: "A1 Pictures Incorporated", malCompanyId: 56 }], [studio]);
		expect(matches.get("a1pictures")?.sourceKey).toBe("Q277763");
	});

	it("uses established Jikan display names after Wikidata identifies the studio", () => {
		const studio = {
			sourceKey: "Q1065717",
			sourceUrl: "https://www.wikidata.org/wiki/Q1065717",
			nameJa: "ジェー・シー・スタッフ",
			nameEn: "J.C.Staff",
			aliases: ["J.C. Staff"],
			malCompanyId: 7,
		};
		const matches = matchStudioNames([{ name: "J.C.Staff", malCompanyId: 7 }], [studio]);
		const names = selectCanonicalStudioNames(
			[studio],
			[
				{
					studio: ["J.C.STAFF"],
					studio_en: ["J.C.Staff"],
					studio_entities: [{ mal_id: 7, name: "J.C.Staff" }],
				},
			],
			matches,
		);

		expect(names.get("Q1065717")).toEqual({
			nameJa: "J.C.STAFF",
			nameEn: "J.C.Staff",
			source: "jikan",
		});
	});
});
