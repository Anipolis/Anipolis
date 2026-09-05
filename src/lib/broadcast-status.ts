import type { BroadcastStatus } from "./types";

export type BroadcastStatusInput = {
	airedFrom: string | null;
	airedTo: string | null;
	type: string | null;
	status: string | null;
};

/**
 * Release types that end once their release date has passed rather than
 * remaining in an airing state until an explicit end date is supplied.
 *
 * This set is also used by the seasonal importers. Keeping the normalisation
 * here prevents the importer and the application-side status mirror from
 * drifting apart when a new upstream type is added.
 */
export const FINITE_RELEASE_TYPES: ReadonlySet<string> = new Set(["movie", "ona", "ova", "tvspecial", "special"]);
// 管理画面の手動登録は日本語ラベル（映画/特別）を使う。英数字正規化では空文字に
// なって判定から漏れるため、日本語ラベルはそのまま照合する
export const JAPANESE_FINITE_RELEASE_TYPES: ReadonlySet<string> = new Set(["映画", "特別"]);

export function normalizeAnimeType(type: string | null | undefined): string {
	return type?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

export function isFiniteReleaseType(type: string | null | undefined): boolean {
	return FINITE_RELEASE_TYPES.has(normalizeAnimeType(type)) || JAPANESE_FINITE_RELEASE_TYPES.has(type?.trim() ?? "");
}

function dateOnly(value: string | null): string | null {
	return value?.slice(0, 10) || null;
}

function getJstDateOnly(): string {
	return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function computeBroadcastStatus(input: BroadcastStatusInput, jstToday = getJstDateOnly()): BroadcastStatus {
	const airedFrom = dateOnly(input.airedFrom);
	const airedTo = dateOnly(input.airedTo);
	if (airedFrom && airedFrom > jstToday) return "upcoming";
	if (airedTo && airedTo < jstToday) return "finished";
	if (airedFrom && airedFrom <= jstToday && airedTo && airedTo >= jstToday) return "airing";
	if (
		!airedTo &&
		isFiniteReleaseType(input.type) &&
		((airedFrom && airedFrom <= jstToday) || input.status === "airing")
	) {
		return "finished";
	}
	if (input.status === "finished") return "finished";
	if (airedFrom && airedFrom <= jstToday && !airedTo) return "airing";
	if (input.status === "upcoming") return "upcoming";
	if (input.status === "airing") return "airing";
	return "unknown";
}
