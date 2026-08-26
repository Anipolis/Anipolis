export type SyobocalLink = {
	name: string;
	url: string;
};

export type SyobocalWikipediaArticleLink = SyobocalLink & {
	articleTitle: string;
	basis: "keyword" | "comment_link";
};

export type SyobocalTitleMatchCandidate = {
	malId: number;
	title: string;
	firstYear: number | null;
	firstMonth: number | null;
	/** MAL media label ("TV", "ONA", "Movie", ...) when known. */
	mediaType?: string | null;
};

export type SyobocalTitleForMatching = {
	tid: number;
	title: string;
	firstYear: number | null;
	firstMonth: number | null;
	titleYomi?: string | null;
	/** Syobocal Cat (1/2/10 = TV anime, 7 = OVA, 8 = movie, ...). */
	category?: number | null;
};

export type SyobocalReadingTitleMatch = {
	malId: number;
	tid: number;
	matchKey: string;
};

export type SyobocalExactTitleMatch = {
	malId: number;
	tid: number;
	normalizedTitle: string;
};

export function normalizeSyobocalTitle(value: string): string {
	return value
		.normalize("NFKC")
		.trim()
		.replace(/[〜～]/g, "~")
		.replace(/[‐‑‒–—―−]/g, "-")
		.replace(/\s+/g, "")
		.replace(
			/(?:\((?:第)?\d+期\)|(?:第)?\d+期|第?\d+シーズン|シーズン\d+|season\d+|\d+(?:st|nd|rd|th)?season)$/i,
			"",
		);
}

export function parseSyobocalLinks(comment: string): SyobocalLink[] {
	const links: SyobocalLink[] = [];
	const seen = new Set<string>();
	for (const match of comment.matchAll(/-\[\[(.*?)\s+(https?:\/\/[^\]]+)\]\]/g)) {
		const name = match[1]?.trim();
		const url = match[2]?.trim();
		if (!name || !url) continue;
		const key = url.toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		links.push({ name, url });
	}
	return links;
}

export function japaneseWikipediaArticleTitle(value: string): string | null {
	try {
		const url = new URL(value);
		const hostname = url.hostname.toLocaleLowerCase();
		if (hostname !== "ja.wikipedia.org" && hostname !== "ja.m.wikipedia.org") return null;
		if (!url.pathname.startsWith("/wiki/")) return null;
		const articleTitle = decodeURIComponent(url.pathname.slice("/wiki/".length)).replaceAll("_", " ").trim();
		if (!articleTitle) return null;
		const namespace = articleTitle.split(":", 1)[0]?.toLocaleLowerCase();
		if (
			namespace &&
			new Set([
				"special",
				"wikipedia",
				"category",
				"file",
				"help",
				"template",
				"portal",
				"talk",
				"特別",
				"カテゴリ",
				"ファイル",
				"ヘルプ",
				"テンプレート",
				"ポータル",
			]).has(namespace)
		) {
			return null;
		}
		return articleTitle;
	} catch {
		return null;
	}
}

export function findSyobocalWikipediaArticleLinks(comment: string): SyobocalWikipediaArticleLink[] {
	const links: SyobocalWikipediaArticleLink[] = [];
	const seen = new Set<string>();
	for (const match of comment.matchAll(/\[\[([^\]\r\n]*?)\s+(https?:\/\/[^\]\s]+)\]\]/gi)) {
		const name = match[1]?.trim();
		const sourceUrl = match[2]?.trim();
		if (!name || !sourceUrl) continue;
		const articleTitle = japaneseWikipediaArticleTitle(sourceUrl);
		if (!articleTitle) continue;
		const key = articleTitle.normalize("NFKC").toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		links.push({
			name: "Wikipedia",
			url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(articleTitle.replaceAll(" ", "_"))}`,
			articleTitle,
			basis: "comment_link",
		});
	}
	return links;
}

export function findSyobocalWikipediaKeywordLinks(keywords: string): SyobocalWikipediaArticleLink[] {
	const links: SyobocalWikipediaArticleLink[] = [];
	const seen = new Set<string>();
	for (const value of keywords.split(",")) {
		const match = value.trim().match(/^wikipedia:(.+)$/i);
		const articleTitle = match?.[1]?.trim();
		if (!articleTitle) continue;
		const key = articleTitle.normalize("NFKC").toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		links.push({
			name: "Wikipedia",
			url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(articleTitle.replaceAll(" ", "_"))}`,
			articleTitle,
			basis: "keyword",
		});
	}
	return links;
}

export function findSyobocalOfficialSiteUrl(links: readonly SyobocalLink[]): string | null {
	return links.find((link) => /^公式(?:\s|\(|（|$)/.test(link.name))?.url ?? null;
}

export function findSyobocalOfficialXUrl(links: readonly SyobocalLink[]): string | null {
	return (
		links.find((link) => {
			if (!/^(?:X|Twitter)(?:\s|\(|（|$)/i.test(link.name)) return false;
			try {
				const hostname = new URL(link.url).hostname.toLocaleLowerCase();
				return hostname === "x.com" || hostname.endsWith(".x.com") || hostname === "twitter.com";
			} catch {
				return false;
			}
		})?.url ?? null
	);
}

const SYOBOCAL_TV_ANIME_CATEGORIES = new Set([1, 2, 10]);

// Guard against same-title cross-format matches (a mini anime or ONA extra
// matching its parent TV series' TID, a movie matching the TV entry, ...).
// Unknown on either side never blocks a match.
export function syobocalTypeConflicts(
	mediaType: string | null | undefined,
	category: number | null | undefined,
): boolean {
	if (!mediaType || category === null || category === undefined) return false;
	const tvAnime = SYOBOCAL_TV_ANIME_CATEGORIES.has(category);
	if (mediaType === "TV") return !tvAnime && category !== 8;
	if (mediaType === "Movie") return tvAnime || category === 7;
	if (mediaType === "OVA") return tvAnime || category === 8;
	if (["ONA", "Special", "TV Special", "Music", "CM", "PV"].includes(mediaType)) return tvAnime || category === 8;
	return false;
}

// Fold to a script-insensitive key: NFKC, katakana -> hiragana, keep letters
// and digits only. Catches カタカナ⇔ひらがな and reading-vs-spelling pairs via
// TitleYomi (シェンムー ⇔ Shenmue is handled by latinFoldTitle instead).
export function kanaFoldTitle(value: string): string {
	let out = "";
	for (const ch of value.normalize("NFKC").toLocaleLowerCase("ja")) {
		const cp = ch.codePointAt(0) as number;
		if (cp >= 0x30a1 && cp <= 0x30f6) out += String.fromCodePoint(cp - 0x60);
		else if (/[\p{L}\p{N}]/u.test(ch)) out += ch;
	}
	return out;
}

const GENERIC_LATIN_FOLD =
	/^(the)?(animation|movie|final|special|specials|season\d*|1st|2nd|3rd|\dth|ova|tv|part\d*|act\d*|ex)+$/;

// Latin-only fold, usable only when the title is MOSTLY Latin script — a
// katakana title with an English suffix must not collapse to that suffix.
export function latinFoldTitle(value: string): string | null {
	const normalized = value.normalize("NFKC");
	const alnumTotal = [...normalized].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
	const latin = normalized.toLowerCase().replace(/[^a-z0-9]/g, "");
	if (latin.length < 6 || alnumTotal === 0 || latin.length / alnumTotal < 0.6) return null;
	if (GENERIC_LATIN_FOLD.test(latin)) return null;
	return latin;
}

function monthDistance(
	leftYear: number | null,
	leftMonth: number | null,
	rightYear: number | null,
	rightMonth: number | null,
): number | null {
	if (leftYear === null || rightYear === null) return null;
	if (leftMonth === null || rightMonth === null) return Math.abs(leftYear - rightYear) * 12;
	return Math.abs(leftYear * 12 + leftMonth - (rightYear * 12 + rightMonth));
}

export function matchSyobocalTitlesExactly(
	catalog: readonly SyobocalTitleMatchCandidate[],
	titles: readonly SyobocalTitleForMatching[],
): SyobocalExactTitleMatch[] {
	const catalogByTitle = new Map<string, SyobocalTitleMatchCandidate[]>();
	for (const candidate of catalog) {
		const normalized = normalizeSyobocalTitle(candidate.title);
		const entries = catalogByTitle.get(normalized) ?? [];
		entries.push(candidate);
		catalogByTitle.set(normalized, entries);
	}

	const titlesByTitle = new Map<string, SyobocalTitleForMatching[]>();
	for (const title of titles) {
		const normalized = normalizeSyobocalTitle(title.title);
		const entries = titlesByTitle.get(normalized) ?? [];
		entries.push(title);
		titlesByTitle.set(normalized, entries);
	}

	const matches: SyobocalExactTitleMatch[] = [];
	for (const [normalizedTitle, catalogCandidates] of catalogByTitle) {
		const titleCandidates = titlesByTitle.get(normalizedTitle) ?? [];
		const eligiblePairs = catalogCandidates.flatMap((catalogCandidate) =>
			titleCandidates.flatMap((titleCandidate) => {
				// No media-type guard here: an exact title with premiere agreement is
				// already strong, and web anime legitimately map to TV-category TIDs
				// once they get a Japanese broadcast. Same-title parent/mini pairs are
				// caught by the uniqueness rule below instead.
				const distance = monthDistance(
					catalogCandidate.firstYear,
					catalogCandidate.firstMonth,
					titleCandidate.firstYear,
					titleCandidate.firstMonth,
				);
				// A missing premiere date no longer auto-passes: an undated pair could
				// silently bind an entry to another season's identically-titled TID.
				return distance !== null && distance <= 1 ? [{ catalogCandidate, titleCandidate }] : [];
			}),
		);
		for (const pair of eligiblePairs) {
			const matchesForCatalog = eligiblePairs.filter(
				(candidate) => candidate.catalogCandidate.malId === pair.catalogCandidate.malId,
			);
			const matchesForTitle = eligiblePairs.filter(
				(candidate) => candidate.titleCandidate.tid === pair.titleCandidate.tid,
			);
			if (matchesForCatalog.length !== 1 || matchesForTitle.length !== 1) continue;
			matches.push({
				malId: pair.catalogCandidate.malId,
				tid: pair.titleCandidate.tid,
				normalizedTitle,
			});
		}
	}
	return matches.sort((left, right) => left.malId - right.malId || left.tid - right.tid);
}

// Second-tier matcher for pairs the normalized-title matcher cannot see:
// script differences (アトリ ⇔ ATRI via TitleYomi, シェンムー ⇔ Shenmue via the
// Latin fold). Stricter than the exact matcher: both sides must carry premiere
// dates within three months, and the pairing must be unique in both directions.
export function matchSyobocalTitlesByReading(
	catalog: readonly SyobocalTitleMatchCandidate[],
	titles: readonly SyobocalTitleForMatching[],
): SyobocalReadingTitleMatch[] {
	const catalogByKey = new Map<string, SyobocalTitleMatchCandidate[]>();
	for (const candidate of catalog) {
		const keys = new Set<string>();
		const kana = kanaFoldTitle(candidate.title);
		if (kana.length >= 3) keys.add(`kana:${kana}`);
		const latin = latinFoldTitle(candidate.title);
		if (latin) keys.add(`latin:${latin}`);
		for (const key of keys) {
			const entries = catalogByKey.get(key) ?? [];
			entries.push(candidate);
			catalogByKey.set(key, entries);
		}
	}

	const titlesByKey = new Map<string, SyobocalTitleForMatching[]>();
	for (const title of titles) {
		const keys = new Set<string>();
		const kana = kanaFoldTitle(title.title);
		if (kana.length >= 3) keys.add(`kana:${kana}`);
		if (title.titleYomi) {
			const yomi = kanaFoldTitle(title.titleYomi);
			if (yomi.length >= 3) keys.add(`kana:${yomi}`);
		}
		const latin = latinFoldTitle(title.title);
		if (latin) keys.add(`latin:${latin}`);
		for (const key of keys) {
			const entries = titlesByKey.get(key) ?? [];
			entries.push(title);
			titlesByKey.set(key, entries);
		}
	}

	const pairs: {
		key: string;
		catalogCandidate: SyobocalTitleMatchCandidate;
		titleCandidate: SyobocalTitleForMatching;
	}[] = [];
	const seenPair = new Set<string>();
	for (const [key, catalogCandidates] of catalogByKey) {
		for (const catalogCandidate of catalogCandidates) {
			for (const titleCandidate of titlesByKey.get(key) ?? []) {
				// The exact matcher already owns identical normalized titles.
				if (normalizeSyobocalTitle(catalogCandidate.title) === normalizeSyobocalTitle(titleCandidate.title))
					continue;
				if (syobocalTypeConflicts(catalogCandidate.mediaType, titleCandidate.category)) continue;
				const distance = monthDistance(
					catalogCandidate.firstYear,
					catalogCandidate.firstMonth,
					titleCandidate.firstYear,
					titleCandidate.firstMonth,
				);
				if (distance === null || distance > 3) continue;
				const pairKey = `${catalogCandidate.malId}:${titleCandidate.tid}`;
				if (seenPair.has(pairKey)) continue;
				seenPair.add(pairKey);
				pairs.push({ key, catalogCandidate, titleCandidate });
			}
		}
	}

	const matches: SyobocalReadingTitleMatch[] = [];
	for (const pair of pairs) {
		const matchesForCatalog = pairs.filter((value) => value.catalogCandidate.malId === pair.catalogCandidate.malId);
		const matchesForTitle = pairs.filter((value) => value.titleCandidate.tid === pair.titleCandidate.tid);
		if (matchesForCatalog.length !== 1 || matchesForTitle.length !== 1) continue;
		matches.push({ malId: pair.catalogCandidate.malId, tid: pair.titleCandidate.tid, matchKey: pair.key });
	}
	return matches.sort((left, right) => left.malId - right.malId || left.tid - right.tid);
}
