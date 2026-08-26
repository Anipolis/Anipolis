import type { BroadcastRoomOverride } from "$lib/types";

export type BroadcastOverrideKind = BroadcastRoomOverride["override_kind"];

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

export function inferBroadcastOverrideKind(override: BroadcastRoomOverride): BroadcastOverrideKind {
	if (override.override_kind) return override.override_kind;
	if (override.is_cancelled) return "cancelled";
	if (
		override.episode_start != null &&
		override.episode_end != null &&
		override.episode_end > override.episode_start
	) {
		return "marathon";
	}
	if (override.episode_label || override.episode_count_increment === 0) return "recap";
	if (
		override.broadcast_time ||
		override.duration_minutes != null ||
		override.pre_open_minutes != null ||
		override.post_close_minutes != null
	) {
		return "time_change";
	}
	return "custom";
}

export function formatBroadcastOverrideKindLabel(override: BroadcastRoomOverride): string {
	switch (inferBroadcastOverrideKind(override)) {
		case "cancelled":
			return "放送休止";
		case "recap":
			return "総集編/特別編";
		case "time_change":
			return "放送時間変更";
		case "marathon":
			return "一挙放送";
		default:
			return "詳細設定";
	}
}

export function formatBroadcastOverrideAnnouncement(override: BroadcastRoomOverride): string {
	const customLabel = override.announcement_label?.trim();
	if (customLabel) return customLabel;

	switch (inferBroadcastOverrideKind(override)) {
		case "cancelled":
			return "今週は放送休止";
		case "recap":
			return normalizedBroadcastEpisodeLabel(override) ?? "総集編/特別編";
		case "time_change":
			return override.broadcast_time ? `放送時間変更：${override.broadcast_time}〜` : "放送時間変更";
		case "marathon":
			return formatBroadcastOverrideEpisodeSummary(override) ?? "一挙放送";
		default:
			return override.note?.trim() || "イレギュラー放送";
	}
}

export function normalizedBroadcastEpisodeLabel(override: BroadcastRoomOverride | undefined): string | null {
	const label = override?.episode_label?.trim();
	if (label) return label;
	if (!override) return null;
	if (inferBroadcastOverrideKind(override) === "recap" || override.episode_count_increment === 0) return "総集編";
	return null;
}

function episodeIncrement(override: BroadcastRoomOverride | undefined): number {
	if (!override) return 1;
	if (override.episode_count_increment != null) return override.episode_count_increment;
	return normalizedBroadcastEpisodeLabel(override) ? 0 : 1;
}

export function formatBroadcastOverrideEpisodeSummary(override: BroadcastRoomOverride): string | null {
	const label = normalizedBroadcastEpisodeLabel(override);
	if (override.episode_start != null && override.episode_end != null) {
		const episode =
			override.episode_start === override.episode_end
				? `第${override.episode_start}話`
				: `第${override.episode_start}話〜第${override.episode_end}話`;
		const suffix = inferBroadcastOverrideKind(override) === "marathon" ? " 一挙放送" : "";
		return label ? `${episode}${suffix} ${label}` : `${episode}${suffix}`;
	}
	return label;
}

export function isMarathonEpisodeSlot(slot: BroadcastEpisodeSlot): boolean {
	return slot.start != null && slot.end != null && slot.end !== slot.start;
}

export function formatMarathonBadge(_slot: BroadcastEpisodeSlot): string {
	return "一挙放送";
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
			const label = normalizedBroadcastEpisodeLabel(override);

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

export type AnchoredNumberingMismatch = { kind: "underflow"; date: string } | { kind: "leftover"; firstNumber: number };

/**
 * しょぼい由来の話数（アンカー）から過去方向へ週次逆算して、同期開始前の
 * 日付に話数を振る。オーバーライドを尊重する:
 * - episode_start/end 明示 → その値を採用し、そこから再逆算
 * - 総集編等（話数進行なしのラベル） → 番号を振らず、カウントも消費しない
 * 前方カウントと違い、誤差が出るとしても最古側に寄る。整合しない場合は
 * mismatch を返す（underflow=第1話より前に到達 / leftover=最古が第1話にならない）。
 * slots は日付昇順で渡すこと。
 */
export function inferEpisodeNumbersBackward(
	slots: BroadcastEpisodeSlot[],
	overrides: ReadonlyMap<string, BroadcastRoomOverride>,
): AnchoredNumberingMismatch | null {
	const anchorIndex = slots.findIndex((slot) => slot.start != null);
	if (anchorIndex <= 0) {
		// アンカー無し、またはアンカーより前の日付が無い
		if (anchorIndex === 0 && slots[0]?.start != null && (slots[0]?.start ?? 1) > 1) {
			return { kind: "leftover", firstNumber: slots[0]?.start ?? 1 };
		}
		return null;
	}
	let mismatch: AnchoredNumberingMismatch | null = null;
	let current = slots[anchorIndex]?.start ?? 1;
	for (let index = anchorIndex - 1; index >= 0; index -= 1) {
		const slot = slots[index];
		if (!slot) continue;
		const override = overrides.get(slot.date);
		if (slot.start != null) {
			// 既に番号を持つ（別の実セッション等）→ 再アンカー
			current = slot.start;
			continue;
		}
		if (override?.episode_start != null && override.episode_end != null) {
			slot.start = override.episode_start;
			slot.end = override.episode_end;
			current = override.episode_start;
			continue;
		}
		if (override && normalizedBroadcastEpisodeLabel(override) !== null) {
			// 総集編等: 番号なし・カウント消費なし（ラベルは呼び出し側で設定済み）
			continue;
		}
		const candidate = current - 1;
		if (candidate < 1) {
			// 数えられる話数より掲載日が多い: 未登録の総集編・特番が疑われる
			mismatch = mismatch ?? { kind: "underflow", date: slot.date };
			continue;
		}
		slot.start = candidate;
		slot.end = candidate;
		current = candidate;
	}
	if (!mismatch) {
		const firstNumbered = slots.find((slot) => slot.start != null);
		if (firstNumbered && (firstNumbered.start ?? 1) > 1) {
			// 最古の掲載日が第1話にならない: 休止週の未登録などが疑われる
			mismatch = { kind: "leftover", firstNumber: firstNumbered.start ?? 1 };
		}
	}
	return mismatch;
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

// スマホ版ルームログの小型ボックス用: 「第」「話」を省いた数字のみの表示
export function formatBroadcastEpisodeNumber(slot: BroadcastEpisodeSlot): string {
	if (slot.start == null || slot.end == null) return slot.label ?? "";
	return slot.start === slot.end ? `${slot.start}` : `${slot.start}-${slot.end}`;
}
