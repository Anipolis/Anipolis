export const WIKIDATA_ANIMATION_STUDIO_ITEM = "Q1107679";
export const WIKIDATA_MAL_COMPANY_PROPERTY = "P11490";
export const WIKIDATA_ANIMATION_STUDIO_URL = "https://www.wikidata.org/wiki/Q1107679";
export const WIKIDATA_MAL_COMPANY_PROPERTY_URL = "https://www.wikidata.org/wiki/Property:P11490";
export const WIKIDATA_STUDIO_TRANSFORMATION_URL =
	"https://github.com/Anipolis/Anipolis/blob/develop/scripts/import-wikidata-studio-names.ts";

export type WikidataStudioBinding = {
	item?: { value?: string };
	jaLabel?: { value?: string };
	enLabel?: { value?: string };
	enAlias?: { value?: string };
	malCompany?: { value?: string };
};

export type WikidataStudioRecord = {
	sourceKey: string;
	sourceUrl: string;
	nameJa: string | null;
	nameEn: string;
	aliases: string[];
	malCompanyId: number | null;
};

export type StudioNameMapping = {
	nameJa: string | null;
	nameEn: string;
	sourceUrl: string;
};

export type StudioSourceCandidate = {
	name: string;
	malCompanyId?: number | null;
};

const CORPORATE_SUFFIXES = new Set(["co", "company", "corp", "corporation", "inc", "incorporated", "limited", "ltd"]);

export function normalizeStudioAlias(value: string): string {
	const parts = value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/&/g, " and ")
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	while (parts.length > 0 && CORPORATE_SUFFIXES.has(parts.at(-1) ?? "")) parts.pop();
	return parts.join("");
}

export function groupWikidataStudios(bindings: readonly WikidataStudioBinding[]): WikidataStudioRecord[] {
	const grouped = new Map<
		string,
		{ sourceUrl: string; ja: Set<string>; en: Set<string>; aliases: Set<string>; malIds: Set<number> }
	>();

	for (const binding of bindings) {
		const sourceUrl = binding.item?.value?.trim();
		const sourceKey = sourceUrl?.match(/\/(Q\d+)$/)?.[1];
		const nameEn = binding.enLabel?.value?.trim();
		if (!sourceUrl || !sourceKey || !nameEn) continue;
		const record = grouped.get(sourceKey) ?? {
			sourceUrl,
			ja: new Set<string>(),
			en: new Set<string>(),
			aliases: new Set<string>(),
			malIds: new Set<number>(),
		};
		record.en.add(nameEn);
		const nameJa = binding.jaLabel?.value?.trim();
		const alias = binding.enAlias?.value?.trim();
		if (nameJa) record.ja.add(nameJa);
		if (alias) record.aliases.add(alias);
		const malCompanyId = Number.parseInt(binding.malCompany?.value ?? "", 10);
		if (Number.isSafeInteger(malCompanyId) && malCompanyId > 0) record.malIds.add(malCompanyId);
		grouped.set(sourceKey, record);
	}

	return [...grouped.entries()]
		.flatMap(([sourceKey, record]) => {
			const namesEn = [...record.en].sort();
			if (namesEn.length !== 1) return [];
			const namesJa = [...record.ja].sort();
			const malIds = [...record.malIds].sort((left, right) => left - right);
			return [
				{
					sourceKey,
					sourceUrl: record.sourceUrl.replace(/^http:\/\//, "https://").replace("/entity/", "/wiki/"),
					nameJa: namesJa.length === 1 ? (namesJa[0] ?? null) : null,
					nameEn: namesEn[0] ?? "",
					aliases: [...record.aliases].sort(),
					malCompanyId: malIds.length === 1 ? (malIds[0] ?? null) : null,
				},
			];
		})
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

export function matchStudioNames(
	sourceCandidates: readonly (string | StudioSourceCandidate)[],
	studios: readonly WikidataStudioRecord[],
): Map<string, WikidataStudioRecord> {
	const candidatesByAlias = new Map<string, Map<string, WikidataStudioRecord>>();
	for (const studio of studios) {
		for (const alias of [studio.nameEn, ...studio.aliases]) {
			const aliasKey = normalizeStudioAlias(alias);
			if (!aliasKey) continue;
			const candidates = candidatesByAlias.get(aliasKey) ?? new Map<string, WikidataStudioRecord>();
			candidates.set(studio.sourceKey, studio);
			candidatesByAlias.set(aliasKey, candidates);
		}
	}
	const studiosByMalCompanyId = new Map<number, WikidataStudioRecord[]>();
	for (const studio of studios) {
		if (!studio.malCompanyId) continue;
		const candidates = studiosByMalCompanyId.get(studio.malCompanyId) ?? [];
		candidates.push(studio);
		studiosByMalCompanyId.set(studio.malCompanyId, candidates);
	}

	const result = new Map<string, WikidataStudioRecord>();
	for (const sourceCandidate of sourceCandidates) {
		const sourceName = typeof sourceCandidate === "string" ? sourceCandidate : sourceCandidate.name;
		const aliasKey = normalizeStudioAlias(sourceName);
		const malCompanyId = typeof sourceCandidate === "string" ? null : sourceCandidate.malCompanyId;
		const idCandidates = malCompanyId ? studiosByMalCompanyId.get(malCompanyId) : undefined;
		if (aliasKey && idCandidates?.length === 1) {
			const studio = idCandidates[0];
			if (studio) result.set(aliasKey, studio);
			continue;
		}
		const candidates = candidatesByAlias.get(aliasKey);
		if (aliasKey && candidates?.size === 1) {
			const studio = candidates.values().next().value;
			if (studio) result.set(aliasKey, studio);
		}
	}
	return result;
}
