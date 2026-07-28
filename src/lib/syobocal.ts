export type SyobocalLink = {
	name: string;
	url: string;
};

export type SyobocalTitleMatchCandidate = {
	malId: number;
	title: string;
	firstYear: number | null;
	firstMonth: number | null;
};

export type SyobocalTitleForMatching = {
	tid: number;
	title: string;
	firstYear: number | null;
	firstMonth: number | null;
};

export type SyobocalExactTitleMatch = {
	malId: number;
	tid: number;
	normalizedTitle: string;
};

export function normalizeSyobocalTitle(value: string): string {
	return value.normalize("NFKC").trim().replace(/\s+/g, " ");
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

function monthDistance(
	leftYear: number | null,
	leftMonth: number | null,
	rightYear: number | null,
	rightMonth: number | null,
): number | null {
	if (leftYear === null || leftMonth === null || rightYear === null || rightMonth === null) return null;
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
				const distance = monthDistance(
					catalogCandidate.firstYear,
					catalogCandidate.firstMonth,
					titleCandidate.firstYear,
					titleCandidate.firstMonth,
				);
				return distance === null || distance <= 1 ? [{ catalogCandidate, titleCandidate }] : [];
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
