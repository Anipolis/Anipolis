import { looseCopyrightKey } from "./annict.ts";

// 期（シーズン）の違いだけの © 候補から、作品の期に合う表記を選ぶ。
// 例: 「虚構推理 Season2」には「…／虚構推理製作委員会」ではなく「…／虚構推理2製作委員会」。
// 公式サイトのフッターは続編の © に、Annict は1期の © のままになりやすいため、
// 両者の食い違いの多くがこの形になる。

const KANJI_DIGITS: Record<string, number> = { 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ROMAN: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

// 期を表す記法。© 本文とタイトルの両方から探す（年号の4桁数字は対象外）
const SEASON_PATTERNS: RegExp[] = [
	/第\s*([2-9]|[二三四五六七八九])\s*期/g,
	/season\s*([2-9])/gi,
	/([2-9])\s*(?:nd|rd|th)\s*season/gi,
	/(?<![a-z])(ii|iii|iv|vi)(?![a-z])/gi,
	/(?<![0-9])([2-9])(?![0-9])/g,
];

function normalize(value: string): string {
	// Ⅱ などのローマ数字記号・全角数字を NFKC で ASCII に寄せ、年（19xx/20xx）を除く
	return value
		.normalize("NFKC")
		.replace(/(19|20)\d{2}/g, " ")
		.toLowerCase();
}

function toNumber(token: string): number | null {
	if (/^[2-9]$/.test(token)) return Number(token);
	if (token in KANJI_DIGITS) return KANJI_DIGITS[token] as number;
	return ROMAN[token.toLowerCase()] ?? null;
}

/** 文字列に含まれる期の番号（複数あれば全部）。「続」は2期として扱う */
export function seasonNumbersIn(value: string): number[] {
	const text = normalize(value);
	const numbers = new Set<number>();
	for (const pattern of SEASON_PATTERNS) {
		for (const match of text.matchAll(pattern)) {
			const number = toNumber(match[1] as string);
			if (number !== null) numbers.add(number);
		}
	}
	if (/続/.test(text)) numbers.add(2);
	return [...numbers];
}

/** 期を表す部分を取り除いた比較キー。期の違いだけの表記は同じキーになる */
function seasonlessKey(value: string): string {
	let text = normalize(value);
	for (const pattern of SEASON_PATTERNS) text = text.replace(pattern, "");
	return looseCopyrightKey(text.replace(/続/g, ""));
}

/**
 * タイトルに明示された期。「第二期」「Season2」「2nd Season」「Ⅱ」「続」や、末尾の数字
 * （「神達に拾われた男2」）を見る。明示が無ければ null（副題だけの続編は判断できない）。
 */
export function titleSeasonNumber(title: string): number | null {
	const text = normalize(title);
	const explicit = [
		/第\s*([2-9]|[二三四五六七八九])\s*期/i,
		/season\s*([2-9])/i,
		/([2-9])\s*(?:nd|rd|th)\s*season/i,
		/(?<![a-z])(ii|iii|iv|vi)(?![a-z])/i,
		/[^\d\s]\s*([2-9])\s*$/,
	];
	for (const pattern of explicit) {
		const token = text.match(pattern)?.[1];
		const number = token ? toNumber(token) : null;
		if (number !== null) return number;
	}
	return /続/.test(text) ? 2 : null;
}

/**
 * 作品の期。タイトルの明示を優先し、無ければ MAL の前作（Prequel）をたどった
 * 何作目か（「ツルネ －つながりの一射－」= 2）を使う。どちらも無ければ1期。
 */
export function resolveSeasonNumber(title: string, prequelOrdinal: number | null): number {
	return titleSeasonNumber(title) ?? prequelOrdinal ?? 1;
}

/**
 * 候補が期の違いだけなら、作品の期（resolveSeasonNumber）に合う候補を返す。期の違い
 * だけでない、または合う候補がちょうど1つでなければ null（人の確認に回す）。
 */
export function pickCopyrightForSeason(season: number, candidates: readonly string[]): string | null {
	const distinct = [...new Map(candidates.map((candidate) => [looseCopyrightKey(candidate), candidate])).values()];
	if (distinct.length < 2) return null;
	const keys = new Set(distinct.map(seasonlessKey));
	if (keys.size !== 1) return null;

	// 候補どうしで共通の数字（作品名の一部など）は期の手がかりにしない
	const numbersByCandidate = distinct.map((candidate) => seasonNumbersIn(candidate));
	const shared = numbersByCandidate.reduce((common, numbers) => common.filter((n) => numbers.includes(n)));
	const seasonOf = (numbers: number[]) => {
		const own = numbers.filter((n) => !shared.includes(n));
		return own.length === 1 ? (own[0] as number) : own.length === 0 ? 1 : null;
	};
	const matches = distinct.filter((_, index) => seasonOf(numbersByCandidate[index] as number[]) === season);
	return matches.length === 1 ? (matches[0] as string) : null;
}
