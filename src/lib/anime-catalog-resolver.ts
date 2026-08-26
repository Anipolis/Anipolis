import { normalizeStudioAlias, type StudioNameMapping } from "./wikidata-studio-names.ts";

export type CatalogSourceName =
	| "manual"
	| "syobocal"
	| "wikidata"
	| "mal"
	| "jikan"
	| "anime_offline_database"
	| "legacy";
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
	metadata_ready?: boolean;
	room_type?: string | null;
	room_type_source?: string | null;
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

function studioIdentityKey(value: string): string {
	return normalizeStudioAlias(value) || value.normalize("NFKC").toLocaleLowerCase();
}

function uniqueStudioAliases(values: string[] | undefined): string[] | undefined {
	if (!values) return undefined;
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = studioIdentityKey(value);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function canonicalStudioNames(
	rawNames: readonly string[],
	mappings: readonly (StudioNameMapping | undefined)[],
	nameFor: (rawName: string, mapping: StudioNameMapping | undefined) => string,
): string[] {
	const seenIdentities = new Set<string>();
	return rawNames.flatMap((rawName, index) => {
		const mapping = mappings[index];
		const identity = mapping ? `wikidata:${mapping.sourceKey}` : `unmapped:${studioIdentityKey(rawName)}`;
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

function publicSyobocalResources(value: unknown): { name: string; url: string }[] {
	return resourceLinks(value).filter((resource) => {
		if (resource.name.toLocaleLowerCase() !== "wikipedia") return false;
		try {
			const hostname = new URL(resource.url).hostname.toLocaleLowerCase();
			return hostname === "ja.wikipedia.org" || hostname === "ja.m.wikipedia.org";
		} catch {
			return false;
		}
	});
}

function mergeResources(syobocal: Record<string, unknown>): { name: string; url: string }[] {
	const combined = publicSyobocalResources(syobocal["resources"]);
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
	const syobocal = bySource.get("syobocal") ?? {};
	const wikidata = bySource.get("wikidata") ?? {};
	const mal = bySource.get("mal") ?? {};
	const jikan = bySource.get("jikan") ?? {};
	const manual = bySource.get("manual") ?? {};
	const malId = sourceRecords[0]?.mal_id ?? legacyRow?.mal_id;
	if (!malId) throw new Error("A MAL ID is required to resolve an anime catalog row.");

	const offlineTitle = stringValue(offline, "title");
	const syobocalJapaneseTitle = stringValue(syobocal, "title_ja");
	const rejectHangul = (value: string | undefined) =>
		value && /[\p{Script=Hangul}]/u.test(value) ? undefined : value;
	const wikidataJapaneseTitle = rejectHangul(stringValue(wikidata, "title_ja"));
	// MALは韓国・中国作品の「日本語タイトル」欄に現地語題をそのまま入れることが
	// ある。かなを含まない題は、日本側ソース（しょぼいマッピング / Wikidata日本語
	// ラベル / manual）の裏付けがない限り検証済みとして扱わない。ハングルは常に拒否。
	const japaneseSideCorroborated =
		bySource.has("syobocal") || wikidataJapaneseTitle !== undefined || stringValue(manual, "title") !== undefined;
	const acceptJapaneseTitle = (value: string | undefined): string | undefined => {
		if (!value) return undefined;
		if (/[\p{Script=Hangul}]/u.test(value)) return undefined;
		if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) return value;
		return japaneseSideCorroborated ? value : undefined;
	};
	const malJapaneseTitle = acceptJapaneseTitle(
		stringValue(mal, "title_ja") ??
			(containsJapaneseScript(stringValue(mal, "title") ?? "") ? stringValue(mal, "title") : undefined),
	);
	const jikanJapaneseTitle = acceptJapaneseTitle(
		stringValue(jikan, "title_ja") ??
			(containsJapaneseScript(stringValue(jikan, "title") ?? "") ? stringValue(jikan, "title") : undefined),
	);
	const legacyJapaneseTitle =
		legacyRow?.title && containsJapaneseScript(legacyRow.title) ? legacyRow.title : undefined;
	const title = firstDefined([
		candidate(stringValue(manual, "title"), "manual", "verified"),
		candidate(syobocalJapaneseTitle, "syobocal", "verified"),
		candidate(wikidataJapaneseTitle, "wikidata", "verified"),
		candidate(malJapaneseTitle, "mal", "verified"),
		candidate(jikanJapaneseTitle, "jikan", "verified"),
		candidate(legacyJapaneseTitle, "legacy", "fallback"),
		candidate(offlineTitle, "anime_offline_database", "source"),
		candidate(stringValue(mal, "title"), "mal", "source"),
		candidate(stringValue(jikan, "title"), "jikan", "source"),
		candidate(legacyRow?.title, "legacy", "fallback"),
		{ value: `MAL ${malId}`, source: "legacy", confidence: "fallback" },
	]);

	// Imported sources contribute only positive values: a stored null means
	// "the import did not find this", and must not shadow lower candidates.
	// Only manual keeps null semantics (an intentional clear by an admin).
	const titleEnglish = firstDefined<string | null>([
		candidate(nullableStringValue(manual, "title_en"), "manual", "verified"),
		candidate(stringValue(mal, "title_en"), "mal", "source"),
		candidate(stringValue(jikan, "title_en"), "jikan", "source"),
		candidate(stringValue(wikidata, "title_en"), "wikidata", "source"),
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
		candidate(stringValue(mal, "title_romaji"), "mal", "source"),
		candidate(stringValue(jikan, "title_romaji"), "jikan", "source"),
		candidate(verifiedRomaji, "wikidata", "verified"),
		candidate(legacyRow?.title_romaji, "legacy", "fallback"),
		candidate(offlineTitle ?? null, "anime_offline_database", "fallback"),
	]);

	const resolveNullableString = (key: string, preferOffline: boolean): ResolvedValue<string | null> =>
		firstDefined<string | null>([
			candidate(nullableStringValue(manual, key), "manual", "verified"),
			...(preferOffline
				? [
						candidate(stringValue(offline, key), "anime_offline_database", "source"),
						candidate(stringValue(mal, key), "mal", "source"),
						candidate(stringValue(jikan, key), "jikan", "source"),
					]
				: [
						candidate(stringValue(mal, key), "mal", "source"),
						candidate(stringValue(jikan, key), "jikan", "source"),
						candidate(stringValue(offline, key), "anime_offline_database", "source"),
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
	// 放送時刻はしょぼい主局（地上波最速）由来を優先する。MAL/Jikanの値は
	// AT-X等の先行放送を指すことがある（骸骨騎士様Ⅱ: MAL=月曜(AT-X)）。
	const broadcastTime = firstDefined<string | null>([
		candidate(nullableStringValue(manual, "broadcast_time"), "manual", "verified"),
		candidate(stringValue(syobocal, "broadcast_time"), "syobocal", "verified"),
		candidate(stringValue(mal, "broadcast_time"), "mal", "source"),
		candidate(stringValue(jikan, "broadcast_time"), "jikan", "source"),
		candidate(legacyRow?.broadcast_time, "legacy", "fallback"),
		{ value: null, source: "legacy", confidence: "fallback" },
	]);
	const resolveOfficialUrl = (key: "official_site_url" | "official_x_url") =>
		firstDefined<string | null>([
			candidate(nullableStringValue(manual, key), "manual", "verified"),
			candidate(stringValue(syobocal, key), "syobocal", "verified"),
			candidate(stringValue(jikan, key), "jikan", "source"),
			candidate(legacyRow?.[key], "legacy", "fallback"),
			{ value: null, source: "legacy", confidence: "fallback" },
		]);
	const officialSiteUrl = resolveOfficialUrl("official_site_url");
	const officialXUrl = resolveOfficialUrl("official_x_url");
	const coverUrl = resolveNullableString("cover_url", false);
	const status = firstDefined([
		candidate(stringValue(manual, "status"), "manual", "verified"),
		candidate(stringValue(offline, "status"), "anime_offline_database", "source"),
		candidate(stringValue(mal, "status"), "mal", "source"),
		candidate(stringValue(jikan, "status"), "jikan", "source"),
		candidate(legacyRow?.status, "legacy", "fallback"),
		{ value: "upcoming", source: "legacy", confidence: "fallback" },
	]);

	const resolveArray = (manualKey: string, jikanKey: string, offlineKey: string): ResolvedValue<string[] | null> =>
		firstDefined<string[] | null>([
			candidate(stringArrayValue(manual, manualKey), "manual", "verified"),
			candidate(nonEmptyStringArrayValue(mal, jikanKey), "mal", "source"),
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
		candidate(uniqueStudioAliases(nonEmptyStringArrayValue(mal, "studio_en")), "mal", "source"),
		candidate(uniqueStudioAliases(nonEmptyStringArrayValue(jikan, "studio_en")), "jikan", "source"),
		candidate(uniqueStudioAliases(nonEmptyStringArrayValue(mal, "studio")), "mal", "source"),
		candidate(uniqueStudioAliases(nonEmptyStringArrayValue(jikan, "studio")), "jikan", "source"),
		candidate(
			uniqueStudioAliases(legacyRow?.studio_en?.length ? legacyRow.studio_en : undefined),
			"legacy",
			"fallback",
		),
		candidate(
			uniqueStudioAliases(nonEmptyStringArrayValue(offline, "studios")),
			"anime_offline_database",
			"fallback",
		),
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
		// Japanese studio display prefers Jikan: both sides run the same EN→JA
		// dictionary, but MAL spells names differently more often, so an
		// untranslated MAL name must not shadow Jikan's translated one.
		candidate(uniqueStudioAliases(nonEmptyStringArrayValue(jikan, "studio")), "jikan", "source"),
		candidate(uniqueStudioAliases(nonEmptyStringArrayValue(mal, "studio")), "mal", "source"),
		candidate(uniqueStudioAliases(legacyRow?.studio?.length ? legacyRow.studio : undefined), "legacy", "fallback"),
		candidate(
			uniqueStudioAliases(nonEmptyStringArrayValue(offline, "studios")),
			"anime_offline_database",
			"fallback",
		),
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
		// 放送曜日もしょぼい主局優先（broadcast_time と同じ理由）
		candidate(numberValue(syobocal, "broadcast_day"), "syobocal", "verified"),
		candidate(numberValue(mal, "broadcast_day"), "mal", "source"),
		candidate(numberValue(jikan, "broadcast_day"), "jikan", "source"),
		candidate(legacyRow?.broadcast_day, "legacy", "fallback"),
		{ value: null, source: "legacy", confidence: "fallback" },
	]);

	const verifiedDisplayTitle =
		["manual", "syobocal", "wikidata", "mal", "jikan"].includes(title.source) && title.confidence === "verified";
	const resolutionStatus = verifiedDisplayTitle ? "verified" : legacyJapaneseTitle ? "review" : "unverified";
	const resolutionReasons = verifiedDisplayTitle
		? []
		: [
				legacyJapaneseTitle
					? "Japanese display title has only legacy provenance."
					: "Verified Japanese display title is missing.",
			];

	// Music videos, PVs and CMs are never published (same policy as the Jikan
	// importer's BLOCKED_TYPES). The check uses the MAL/Jikan media label
	// directly: anime-offline-database has no music type and mislabels these
	// entries as "Special", so the resolved type alone cannot be trusted.
	const mediaTypeLabel = (stringValue(mal, "type") ?? stringValue(jikan, "type"))?.toLowerCase() ?? null;
	const blockedMediaType = mediaTypeLabel !== null && ["music", "pv", "cm"].includes(mediaTypeLabel);
	if (blockedMediaType) resolutionReasons.push("Music/PV/CM entries are not published.");

	// 放送中の作品では anime-offline-database の話数がスナップショット時点で
	// 固定された古い値になりがち（例: BEYBLADE X）。放送中はMAL/Jikanの現行値を
	// 優先し、どちらにも無ければ「総話数未確定」として null にする。
	// 「放送中」の判定は放送日付を優先する: ソースレコードの status は取り込みが
	// 止まると陳腐化し（放送開始後もupcomingのまま等）、保存statusだけに頼ると
	// このルールが素通り/誤発動する。日付が無い場合のみ status にフォールバック。
	const todayJst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
	const airedFromKey = airedFrom.value?.slice(0, 10) ?? null;
	const airedToKey = airedTo.value?.slice(0, 10) ?? null;
	// 終了日不明（単発映画等はtoが無いままfinishedになる）は status で補完する
	const effectivelyAiring =
		airedFromKey != null && airedFromKey <= todayJst
			? airedToKey != null
				? airedToKey >= todayJst
				: status.value !== "finished"
			: airedFromKey != null
				? false
				: status.value === "airing";
	if (effectivelyAiring && episodeCount.source === "anime_offline_database") {
		const liveCount = stringValue(mal, "episode_count") ?? stringValue(jikan, "episode_count") ?? null;
		episodeCount.value = liveCount;
		if (liveCount !== null) episodeCount.source = stringValue(mal, "episode_count") ? "mal" : "jikan";
	}

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
			resources: mergeResources(syobocal),
			cover_url: coverUrl.value,
			metadata_ready: resolutionStatus === "verified" && !blockedMediaType,
		},
		fieldSources,
		resolutionStatus,
		resolutionReasons,
	};
}
