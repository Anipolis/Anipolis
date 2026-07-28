import type { StudioNameMapping } from "./wikidata-studio-names";

export type CatalogSourceName = "manual" | "wikidata" | "jikan" | "anime_offline_database" | "legacy";
export type ResolutionConfidence = "verified" | "source" | "fallback";

export type CatalogSourceRecord = {
	id?: number;
	mal_id: number;
	source: Exclude<CatalogSourceName, "legacy">;
	source_url: string;
	normalized_data: unknown;
};

export type LegacyAnimeCatalogRow = {
	mal_id: number;
	title: string;
	title_en: string | null;
	title_romaji: string | null;
	episode_count: string | null;
	type: string | null;
	status: string;
	aired_from: string | null;
	aired_to: string | null;
	season: string | null;
	source: string | null;
	studio: string[] | null;
	studio_en: string[] | null;
	genre: string[] | null;
	genre_en: string[] | null;
	broadcast_day: number | null;
	broadcast_time: string | null;
	official_site_url: string | null;
	official_x_url: string | null;
	resources: unknown;
	cover_url: string | null;
};

export type AnimeCatalogCanonicalRow = Omit<LegacyAnimeCatalogRow, "resources"> & {
	resources: { name: string; url: string }[];
	metadata_ready: boolean;
};

export type AnimeCatalogResolution = {
	canonical: AnimeCatalogCanonicalRow;
	fieldSources: Record<string, { source: CatalogSourceName; confidence: ResolutionConfidence }>;
	resolutionStatus: "unverified" | "review" | "verified";
	resolutionReasons: string[];
};

type ResolvedValue<T> = {
	value: T;
	source: CatalogSourceName;
	confidence: ResolutionConfidence;
};

function containsJapaneseScript(value: string): boolean {
	return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableStringValue(record: Record<string, unknown>, key: string): string | null | undefined {
	if (!(key in record)) return undefined;
	const value = record[key];
	if (value === null) return null;
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(record: Record<string, unknown>, key: string): number | null | undefined {
	if (!(key in record)) return undefined;
	const value = record[key];
	if (value === null) return null;
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayValue(record: Record<string, unknown>, key: string): string[] | undefined {
	const value = record[key];
	if (!Array.isArray(value)) return undefined;
	return [
		...new Set(
			value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean),
		),
	];
}

function nonEmptyStringArrayValue(record: Record<string, unknown>, key: string): string[] | undefined {
	const value = stringArrayValue(record, key);
	return value && value.length > 0 ? value : undefined;
}

function canonicalStudioNames(
	rawNames: readonly string[],
	mappings: readonly (StudioNameMapping | undefined)[],
	nameFor: (rawName: string, mapping: StudioNameMapping | undefined) => string,
): string[] {
	const seenIdentities = new Set<string>();
	return rawNames.flatMap((rawName, index) => {
		const mapping = mappings[index];
		const identity = mapping
			? `wikidata:${mapping.sourceKey}`
			: `unmapped:${rawName.normalize("NFKC").toLocaleLowerCase()}`;
		if (seenIdentities.has(identity)) return [];
		seenIdentities.add(identity);
		return [nameFor(rawName, mapping)];
	});
}

function firstDefined<T>(values: readonly (ResolvedValue<T> | undefined)[]): ResolvedValue<T> {
	for (const value of values) {
		if (value !== undefined) return value;
	}
	throw new Error("Catalog resolution did not have a fallback value.");
}

function candidate<T>(
	value: T | undefined,
	source: CatalogSourceName,
	confidence: ResolutionConfidence,
): ResolvedValue<T> | undefined {
	return value === undefined ? undefined : { value, source, confidence };
}

function normalizeLatinTitle(value: string): string {
	return value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

export function selectVerifiedRomajiCandidate(
	offlineTitle: string | undefined,
	englishTitle: string | undefined,
	aliases: readonly string[],
): string | undefined {
	if (!offlineTitle || containsJapaneseScript(offlineTitle)) return undefined;
	const normalizedOffline = normalizeLatinTitle(offlineTitle);
	if (!normalizedOffline) return undefined;
	const matchingAliases = aliases.filter((alias) => {
		if (!alias.trim() || alias === englishTitle) return false;
		const normalizedAlias = normalizeLatinTitle(alias);
		return (
			normalizedAlias === normalizedOffline ||
			normalizedAlias.includes(normalizedOffline) ||
			normalizedOffline.includes(normalizedAlias)
		);
	});
	return matchingAliases.length > 0 ? offlineTitle : undefined;
}

function resourceLinks(value: unknown): { name: string; url: string }[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const record = asRecord(item);
		const name = stringValue(record, "name");
		const url = stringValue(record, "url");
		return name && url ? [{ name, url }] : [];
	});
}

function mergeResources(
	legacy: unknown,
	sourceRecords: readonly CatalogSourceRecord[],
	jikan: Record<string, unknown>,
): { name: string; url: string }[] {
	const sourceNames = {
		anime_offline_database: "anime-offline-database",
		wikidata: "Wikidata",
	} as const;
	const combined = [
		...resourceLinks(legacy),
		...resourceLinks(jikan["resources"]),
		...sourceRecords
			.filter(
				(record): record is CatalogSourceRecord & { source: keyof typeof sourceNames } =>
					record.source === "anime_offline_database" || record.source === "wikidata",
			)
			.map((record) => ({ name: sourceNames[record.source], url: record.source_url })),
	];
	const seen = new Set<string>();
	return combined
		.filter((resource) => {
			const key = resource.url.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((left, right) => left.url.localeCompare(right.url));
}

export function resolveAnimeCatalog(
	sourceRecords: readonly CatalogSourceRecord[],
	legacyRow?: LegacyAnimeCatalogRow,
	resolveStudioName: (name: string) => StudioNameMapping | undefined = () => undefined,
): AnimeCatalogResolution {
	const bySource = new Map(sourceRecords.map((record) => [record.source, asRecord(record.normalized_data)]));
	const offline = bySource.get("anime_offline_database") ?? {};
	const wikidata = bySource.get("wikidata") ?? {};
	const jikan = bySource.get("jikan") ?? {};
	const manual = bySource.get("manual") ?? {};
	const malId = sourceRecords[0]?.mal_id ?? legacyRow?.mal_id;
	if (!malId) throw new Error("A MAL ID is required to resolve an anime catalog row.");

	const offlineTitle = stringValue(offline, "title");
	const wikidataJapaneseTitle = stringValue(wikidata, "title_ja");
	const jikanJapaneseTitle =
		stringValue(jikan, "title_ja") ??
		(containsJapaneseScript(stringValue(jikan, "title") ?? "") ? stringValue(jikan, "title") : undefined);
	const legacyJapaneseTitle =
		legacyRow?.title && containsJapaneseScript(legacyRow.title) ? legacyRow.title : undefined;
	const title = firstDefined([
		candidate(stringValue(manual, "title"), "manual", "verified"),
		candidate(wikidataJapaneseTitle, "wikidata", "verified"),
		candidate(jikanJapaneseTitle, "jikan", "verified"),
		candidate(legacyJapaneseTitle, "legacy", "fallback"),
		candidate(offlineTitle, "anime_offline_database", "source"),
		candidate(stringValue(jikan, "title"), "jikan", "source"),
		candidate(legacyRow?.title, "legacy", "fallback"),
		{ value: `MAL ${malId}`, source: "legacy", confidence: "fallback" },
	]);

	const titleEnglish = firstDefined<string | null>([
		candidate(nullableStringValue(manual, "title_en"), "manual", "verified"),
		candidate(nullableStringValue(jikan, "title_en"), "jikan", "source"),
		candidate(nullableStringValue(wikidata, "title_en"), "wikidata", "source"),
		candidate(legacyRow?.title_en, "legacy", "fallback"),
		{ value: null, source: "legacy", confidence: "fallback" },
	]);
	const wikidataAliases = stringArrayValue(wikidata, "title_en_aliases") ?? [];
	const verifiedRomaji = selectVerifiedRomajiCandidate(
		offlineTitle,
		titleEnglish.value ?? undefined,
		wikidataAliases,
	);
	const titleRomaji = firstDefined<string | null>([
		candidate(nullableStringValue(manual, "title_romaji"), "manual", "verified"),
		candidate(nullableStringValue(jikan, "title_romaji"), "jikan", "source"),
		candidate(verifiedRomaji, "wikidata", "verified"),
		candidate(legacyRow?.title_romaji, "legacy", "fallback"),
		candidate(offlineTitle ?? null, "anime_offline_database", "fallback"),
	]);

	const resolveNullableString = (key: string, preferOffline: boolean): ResolvedValue<string | null> =>
		firstDefined<string | null>([
			candidate(nullableStringValue(manual, key), "manual", "verified"),
			...(preferOffline
				? [
						candidate(nullableStringValue(offline, key), "anime_offline_database", "source"),
						candidate(nullableStringValue(jikan, key), "jikan", "source"),
					]
				: [
						candidate(nullableStringValue(jikan, key), "jikan", "source"),
						candidate(nullableStringValue(offline, key), "anime_offline_database", "source"),
					]),
			candidate(
				legacyRow?.[key as keyof LegacyAnimeCatalogRow] as string | null | undefined,
				"legacy",
				"fallback",
			),
			{ value: null, source: "legacy", confidence: "fallback" },
		]);

	const episodeCount = resolveNullableString("episode_count", true);
	const type = resolveNullableString("type", true);
	const season = resolveNullableString("season", true);
	const source = resolveNullableString("source", false);
	const airedFrom = resolveNullableString("aired_from", false);
	const airedTo = resolveNullableString("aired_to", false);
	const broadcastTime = resolveNullableString("broadcast_time", false);
	const officialSiteUrl = resolveNullableString("official_site_url", false);
	const officialXUrl = resolveNullableString("official_x_url", false);
	const coverUrl = resolveNullableString("cover_url", false);
	const status = firstDefined([
		candidate(stringValue(manual, "status"), "manual", "verified"),
		candidate(stringValue(offline, "status"), "anime_offline_database", "source"),
		candidate(stringValue(jikan, "status"), "jikan", "source"),
		candidate(legacyRow?.status, "legacy", "fallback"),
		{ value: "upcoming", source: "legacy", confidence: "fallback" },
	]);

	const resolveArray = (manualKey: string, jikanKey: string, offlineKey: string): ResolvedValue<string[] | null> =>
		firstDefined<string[] | null>([
			candidate(stringArrayValue(manual, manualKey), "manual", "verified"),
			candidate(nonEmptyStringArrayValue(jikan, jikanKey), "jikan", "source"),
			candidate(
				legacyRow?.[manualKey as keyof LegacyAnimeCatalogRow] as string[] | null | undefined,
				"legacy",
				"fallback",
			),
			candidate(nonEmptyStringArrayValue(offline, offlineKey), "anime_offline_database", "fallback"),
			{ value: null, source: "legacy", confidence: "fallback" },
		]);
	const rawStudioNames = firstDefined<string[] | null>([
		candidate(nonEmptyStringArrayValue(jikan, "studio_en"), "jikan", "source"),
		candidate(nonEmptyStringArrayValue(jikan, "studio"), "jikan", "source"),
		candidate(legacyRow?.studio_en?.length ? legacyRow.studio_en : undefined, "legacy", "fallback"),
		candidate(nonEmptyStringArrayValue(offline, "studios"), "anime_offline_database", "fallback"),
		{ value: null, source: "legacy", confidence: "fallback" },
	]);
	const mappedStudioNames = rawStudioNames.value?.map(resolveStudioName);
	const hasMappedStudio = mappedStudioNames?.some(Boolean) ?? false;
	const studio = firstDefined<string[] | null>([
		candidate(stringArrayValue(manual, "studio"), "manual", "verified"),
		hasMappedStudio && rawStudioNames.value
			? {
					value: canonicalStudioNames(
						rawStudioNames.value,
						mappedStudioNames ?? [],
						(name, mapping) => mapping?.nameJa ?? mapping?.nameEn ?? name,
					),
					source: "wikidata",
					confidence: "verified",
				}
			: undefined,
		candidate(nonEmptyStringArrayValue(jikan, "studio"), "jikan", "source"),
		candidate(legacyRow?.studio?.length ? legacyRow.studio : undefined, "legacy", "fallback"),
		candidate(nonEmptyStringArrayValue(offline, "studios"), "anime_offline_database", "fallback"),
		{ value: null, source: "legacy", confidence: "fallback" },
	]);
	const studioEnglish = firstDefined<string[] | null>([
		candidate(stringArrayValue(manual, "studio_en"), "manual", "verified"),
		hasMappedStudio && rawStudioNames.value
			? {
					value: canonicalStudioNames(
						rawStudioNames.value,
						mappedStudioNames ?? [],
						(name, mapping) => mapping?.nameEn ?? name,
					),
					source: "wikidata",
					confidence: "verified",
				}
			: undefined,
		rawStudioNames,
	]);
	const genre = resolveArray("genre", "genre", "genres");
	const genreEnglish = resolveArray("genre_en", "genre_en", "genres");
	const broadcastDay = firstDefined<number | null>([
		candidate(numberValue(manual, "broadcast_day"), "manual", "verified"),
		candidate(numberValue(jikan, "broadcast_day"), "jikan", "source"),
		candidate(legacyRow?.broadcast_day, "legacy", "fallback"),
		{ value: null, source: "legacy", confidence: "fallback" },
	]);

	const verifiedDisplayTitle =
		["manual", "wikidata", "jikan"].includes(title.source) && title.confidence === "verified";
	const resolutionStatus = verifiedDisplayTitle ? "verified" : legacyJapaneseTitle ? "review" : "unverified";
	const resolutionReasons = verifiedDisplayTitle
		? []
		: [
				legacyJapaneseTitle
					? "Japanese display title has only legacy provenance."
					: "Verified Japanese display title is missing.",
			];

	const resolvedFields = {
		title,
		title_en: titleEnglish,
		title_romaji: titleRomaji,
		episode_count: episodeCount,
		type,
		status,
		aired_from: airedFrom,
		aired_to: airedTo,
		season,
		source,
		studio,
		studio_en: studioEnglish,
		genre,
		genre_en: genreEnglish,
		broadcast_day: broadcastDay,
		broadcast_time: broadcastTime,
		official_site_url: officialSiteUrl,
		official_x_url: officialXUrl,
		cover_url: coverUrl,
	};
	const fieldSources = Object.fromEntries(
		Object.entries(resolvedFields).map(([field, resolved]) => [
			field,
			{ source: resolved.source, confidence: resolved.confidence },
		]),
	);

	return {
		canonical: {
			mal_id: malId,
			title: title.value,
			title_en: titleEnglish.value,
			title_romaji: titleRomaji.value,
			episode_count: episodeCount.value,
			type: type.value,
			status: status.value,
			aired_from: airedFrom.value,
			aired_to: airedTo.value,
			season: season.value,
			source: source.value,
			studio: studio.value,
			studio_en: studioEnglish.value,
			genre: genre.value,
			genre_en: genreEnglish.value,
			broadcast_day: broadcastDay.value,
			broadcast_time: broadcastTime.value,
			official_site_url: officialSiteUrl.value,
			official_x_url: officialXUrl.value,
			resources: mergeResources(legacyRow?.resources, sourceRecords, jikan),
			cover_url: coverUrl.value,
			metadata_ready: resolutionStatus === "verified",
		},
		fieldSources,
		resolutionStatus,
		resolutionReasons,
	};
}
