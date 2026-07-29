import type { BroadcastStatus } from "./types";

export type BroadcastStatusInput = {
	airedFrom: string | null;
	airedTo: string | null;
	type: string | null;
	status: string | null;
};

const FINITE_RELEASE_TYPES = new Set(["movie", "ona", "ova", "tvspecial", "special"]);

function dateOnly(value: string | null): string | null {
	return value?.slice(0, 10) || null;
}

function getJstDateOnly(): string {
	return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function computeBroadcastStatus(input: BroadcastStatusInput, jstToday = getJstDateOnly()): BroadcastStatus {
	const airedFrom = dateOnly(input.airedFrom);
	const airedTo = dateOnly(input.airedTo);
	const normalizedType = input.type?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
	const isFiniteReleaseType = FINITE_RELEASE_TYPES.has(normalizedType);

	if (airedFrom && airedFrom > jstToday) return "upcoming";
	if (airedTo && airedTo < jstToday) return "finished";
	if (airedFrom && airedFrom <= jstToday && airedTo && airedTo >= jstToday) return "airing";
	if (!airedTo && isFiniteReleaseType && ((airedFrom && airedFrom <= jstToday) || input.status === "airing")) {
		return "finished";
	}
	if (input.status === "finished") return "finished";
	if (airedFrom && airedFrom <= jstToday && !airedTo) return "airing";
	if (input.status === "upcoming") return "upcoming";
	if (input.status === "airing") return "airing";
	return "unknown";
}
