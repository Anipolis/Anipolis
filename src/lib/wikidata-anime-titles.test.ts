import { describe, expect, it } from "vitest";
import {
	getKanaTitleCandidates,
	groupWikidataJapaneseTitles,
	shouldApplyWikidataTitle,
	toWikidataPageUrl,
} from "./wikidata-anime-titles";

describe("Wikidata anime title helpers", () => {
	it("keeps kana-containing synonyms as unverified candidates", () => {
		expect(getKanaTitleCandidates(["Hikari no Ou", "火狩りの王", "火狩りの王", "光之王"])).toEqual(["火狩りの王"]);
	});

	it("turns Wikidata entity IRIs into stable page URLs", () => {
		expect(toWikidataPageUrl("http://www.wikidata.org/entity/Q122856067")).toBe(
			"https://www.wikidata.org/wiki/Q122856067",
		);
		expect(toWikidataPageUrl("https://example.com/item/1")).toBe("https://example.com/item/1");
	});

	it("groups language-tagged labels and refuses conflicting labels", () => {
		const records = groupWikidataJapaneseTitles([
			{
				mal: { value: "43760" },
				item: { value: "http://www.wikidata.org/entity/Q122856067" },
				jaLabel: { value: "火狩りの王 第1期" },
			},
			{
				mal: { value: "43760" },
				item: { value: "http://www.wikidata.org/entity/Q999" },
				jaLabel: { value: "火狩りの王" },
			},
		]);

		expect(records[0]).toMatchObject({
			malId: 43760,
			titleJa: null,
			titleJaCandidates: ["火狩りの王", "火狩りの王 第1期"],
		});
	});

	it("only replaces the untouched ODbL fallback title", () => {
		expect(shouldApplyWikidataTitle("Hikari no Ou", "Hikari no Ou", "火狩りの王")).toBe(true);
		expect(shouldApplyWikidataTitle("火狩りの王", "Hikari no Ou", "火狩りの王")).toBe(false);
		expect(shouldApplyWikidataTitle("Custom title", "Hikari no Ou", "火狩りの王")).toBe(false);
	});
});
