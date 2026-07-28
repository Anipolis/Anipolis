export const WIKIDATA_SOURCE_NAME = "wikidata";
export const WIKIDATA_PROPERTY_MAL_ANIME_ID_URL = "https://www.wikidata.org/wiki/Property:P4086";
export const WIKIDATA_CC0_URL = "https://www.wikidata.org/wiki/Wikidata:Copyright";
export const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
export const WIKIDATA_TRANSFORMATION_URL =
	"https://github.com/Anipolis/Anipolis/blob/develop/scripts/import-wikidata-anime-titles.ts";

export type WikidataBinding = {
	mal?: { value?: string };
	item?: { value?: string };
	jaLabel?: { value?: string };
};

export type WikidataTitleRecord = {
	malId: number;
	titleJa: string | null;
	titleJaCandidates: string[];
	itemUrls: string[];
};

export function getKanaTitleCandidates(values: readonly string[]): string[] {
	return [
		...new Set(
			values
				.map((value) => value.trim())
				.filter(Boolean)
				.filter((value) => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)),
		),
	];
}

export function groupWikidataJapaneseTitles(bindings: readonly WikidataBinding[]): WikidataTitleRecord[] {
	const grouped = new Map<number, { titles: Set<string>; itemUrls: Set<string> }>();

	for (const binding of bindings) {
		const malId = Number.parseInt(binding.mal?.value ?? "", 10);
		const title = binding.jaLabel?.value?.trim();
		const itemUrl = binding.item?.value?.trim();
		if (!Number.isSafeInteger(malId) || malId < 1 || !title || !itemUrl) continue;

		const record = grouped.get(malId) ?? { titles: new Set<string>(), itemUrls: new Set<string>() };
		record.titles.add(title);
		record.itemUrls.add(itemUrl);
		grouped.set(malId, record);
	}

	return [...grouped.entries()]
		.map(([malId, record]) => {
			const titleJaCandidates = [...record.titles].sort();
			return {
				malId,
				titleJa: titleJaCandidates.length === 1 ? (titleJaCandidates[0] ?? null) : null,
				titleJaCandidates,
				itemUrls: [...record.itemUrls].sort(),
			};
		})
		.sort((left, right) => left.malId - right.malId);
}

export function toWikidataPageUrl(entityUrl: string): string {
	const itemId = entityUrl.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/)?.[1];
	return itemId ? `https://www.wikidata.org/wiki/${itemId}` : entityUrl;
}

export function shouldApplyWikidataTitle(
	currentTitle: string,
	animeOfflineTitle: string,
	wikidataTitle: string | null,
): boolean {
	return (
		Boolean(wikidataTitle?.trim()) &&
		!containsJapaneseScript(currentTitle) &&
		currentTitle.trim() === animeOfflineTitle.trim() &&
		currentTitle.trim() !== wikidataTitle?.trim()
	);
}

import { containsJapaneseScript } from "./anime-offline-database";
