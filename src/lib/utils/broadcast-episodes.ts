import type { BroadcastRoomOverride } from "$lib/types";

export interface BroadcastEpisodeSlot {
	date: string;
	start: number | null;
	end: number | null;
	label: string | null;
}

interface BroadcastEpisodeInput {
	airedFrom: string;
	airedTo: string | null;
	broadcastDay: number | null;
	broadcastTime: string | null;
	episodeCount: string | null;
	overrides?: BroadcastRoomOverride[];
	today?: Date;
}

interface ResolveBroadcastEpisodeInput extends BroadcastEpisodeInput {
	date: string;
}

function toDateStr(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function parseDate(value: string): Date {
	return new Date(`${value.slice(0, 10)}T00:00:00`);
}

function broadcastHour(value: string | null): number {
	const match = value?.match(/^(\d{1,2}):([0-5]\d)/);
	return match ? Number(match[1]) : 0;
}

function actualBroadcastDate(roomDate: Date, broadcastTime: string | null): Date {
	const actual = new Date(roomDate);
	if (broadcastHour(broadcastTime) >= 24) actual.setDate(actual.getDate() + 1);
	return actual;
}

function normalizedLabel(override: BroadcastRoomOverride | undefined): string | null {
	const label = override?.episode_label?.trim();
	return label || null;
}

function episodeIncrement(override: BroadcastRoomOverride | undefined): number {
	if (!override) return 1;
	if (override.episode_count_increment != null) return override.episode_count_increment;
	return normalizedLabel(override) ? 0 : 1;
}

export function generateBroadcastEpisodeSlots({
	airedFrom,
	airedTo,
	broadcastDay,
	broadcastTime,
	episodeCount,
	overrides = [],
	today = new Date(),
}: BroadcastEpisodeInput): BroadcastEpisodeSlot[] {
	const start = parseDate(airedFrom);
	const end = airedTo ? parseDate(airedTo) : today;
	const cutoff = end < today ? end : today;
	const cutoffKey = toDateStr(cutoff);
	const startKey = toDateStr(start);

	const slotDates = new Set<string>();
	if (broadcastDay != null) {
		const first = new Date(start);
		if (broadcastHour(broadcastTime) >= 24) first.setDate(first.getDate() - 1);

		while (
			first.getDay() !== broadcastDay ||
			actualBroadcastDate(first, broadcastTime).getTime() < start.getTime()
		) {
			first.setDate(first.getDate() + 1);
		}

		const cur = new Date(first);
		while (cur <= cutoff) {
			slotDates.add(toDateStr(cur));
			cur.setDate(cur.getDate() + 7);
		}
	}

	for (const override of overrides) {
		const date = override.room_date.slice(0, 10);
		if (date >= startKey && date <= cutoffKey) slotDates.add(date);
	}

	const overrideByDate = new Map(overrides.map((override) => [override.room_date.slice(0, 10), override]));
	const maxEp = episodeCount ? parseInt(episodeCount, 10) : null;
	const cap = (n: number) => (maxEp != null && !Number.isNaN(maxEp) && n > maxEp ? maxEp : n);

	let episodeCounter = 1;
	return [...slotDates]
		.sort()
		.map((date): BroadcastEpisodeSlot | null => {
			const override = overrideByDate.get(date);
			if (override?.is_cancelled) return null;
			const label = normalizedLabel(override);

			if (override?.episode_start != null && override.episode_end != null) {
				episodeCounter = override.episode_end + 1;
				return { date, start: cap(override.episode_start), end: cap(override.episode_end), label };
			}

			const increment = episodeIncrement(override);
			const slot = label
				? { date, start: null, end: null, label }
				: { date, start: cap(episodeCounter), end: cap(episodeCounter), label: null };
			episodeCounter += increment;
			return slot;
		})
		.filter((slot): slot is BroadcastEpisodeSlot => slot !== null);
}

export function resolveBroadcastEpisodeSlot(input: ResolveBroadcastEpisodeInput): BroadcastEpisodeSlot | null {
	const target = parseDate(input.date);
	const slots = generateBroadcastEpisodeSlots({ ...input, today: target });
	return slots.find((slot) => slot.date === input.date) ?? null;
}

export function formatBroadcastEpisodeSlot(slot: BroadcastEpisodeSlot): string {
	if (slot.start == null || slot.end == null) return slot.label ?? "";
	return slot.start === slot.end ? `第${slot.start}話` : `第${slot.start}話〜第${slot.end}話`;
}
