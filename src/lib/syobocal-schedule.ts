export type SyobocalScheduleProgram = {
	pid: number;
	tid: number;
	chid: number;
	startsAt: string;
	endsAt: string;
	episodeNumber: number | null;
	subtitle: string | null;
	deleted: boolean;
	/** Syobocal ProgItem Flag bitmask (1=注意, 2=新番組, 4=最終回, 8=再放送). */
	flags?: number;
};

export type SyobocalScheduleMapping = {
	malId: number;
	tid: number;
	validFrom: string | null;
	validTo: string | null;
};

export type SyobocalScheduleTitle = {
	tid: number;
	firstChannel: string | null;
};

export type SyobocalScheduleChannel = {
	chid: number;
	name: string;
	epgName: string | null;
	/** Syobocal ChGID; determines the broadcast tier (terrestrial / BS / excluded). */
	channelGroupId?: number | null;
};

export type PrimarySyobocalProgram = SyobocalScheduleProgram & {
	malId: number;
	channelName: string;
};

function normalizeChannelName(value: string): string {
	return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
}

// Intl.DateTimeFormat construction is expensive; reuse one instance.
const JST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Tokyo",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

export function jstDate(value: string | Date): string {
	return JST_DATE_FORMATTER.format(typeof value === "string" ? new Date(value) : value);
}

const JST_HOUR_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Asia/Tokyo",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

const LATE_NIGHT_BOUNDARY_HOUR = 4;

/**
 * 放送日付（深夜アニメ慣習）: JSTで午前4時より前の枠は前日の放送として扱う。
 * broadcast_room_overrides / ensure_broadcast_room_session の room_date と同じ基準。
 */
export function jstBroadcastDate(value: string | Date): string {
	const date = typeof value === "string" ? new Date(value) : value;
	return jstDate(new Date(date.getTime() - LATE_NIGHT_BOUNDARY_HOUR * 60 * 60 * 1000));
}

/** 放送時刻表示（深夜アニメ慣習）: 午前4時より前は「25:30」のような24時間超表記 */
export function jstBroadcastTimeLabel(value: string | Date): string | null {
	const date = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) return null;
	const formatted = JST_HOUR_FORMATTER.format(date);
	const [hourText, minuteText] = formatted.split(":");
	const hour = Number.parseInt(hourText ?? "", 10);
	if (!Number.isFinite(hour) || minuteText === undefined) return null;
	return hour < LATE_NIGHT_BOUNDARY_HOUR
		? `${hour + 24}:${minuteText}`
		: `${String(hour).padStart(2, "0")}:${minuteText}`;
}

function episodeIdentity(program: SyobocalScheduleProgram): string {
	if (program.episodeNumber !== null) return `episode:${program.episodeNumber}`;
	if (program.subtitle) return `subtitle:${program.subtitle.normalize("NFKC").trim()}`;
	// 話数も副題も無い枠は放送日で区別する: 単一キーに潰すと別日の特番が
	// 「同じ話の別局」扱いされて1本しか残らない。同日内の局違いは従来どおり統合。
	return `unnumbered:${jstBroadcastDate(program.startsAt)}`;
}

// Syobocal ChGID groups for free-to-air TV. Everything else (CS incl. AT-X,
// web streams, radio) is excluded from broadcast room scheduling: rooms follow
// the earliest terrestrial airing, falling back to BS-only titles.
const TERRESTRIAL_CHANNEL_GROUPS = new Set([1, 8, 11, 13, 14, 18, 19, 20, 21, 22, 25, 26]);
const BS_CHANNEL_GROUPS = new Set([2, 9, 28]);

function channelTier(channel: SyobocalScheduleChannel | undefined): number | null {
	const groupId = channel?.channelGroupId;
	if (groupId === null || groupId === undefined) return null;
	if (TERRESTRIAL_CHANNEL_GROUPS.has(groupId)) return 0;
	if (BS_CHANNEL_GROUPS.has(groupId)) return 1;
	return null;
}

const RERUN_FLAG = 8;

// Only rerun slots are dropped here: they would duplicate an episode's room on
// a later date. Recap/special/marathon slots DO open rooms by design — the
// broadcast room override system (総集編/一挙放送/放送休止/時間変更) labels them
// and controls the episode counter downstream.
function isSchedulableProgram(program: SyobocalScheduleProgram): boolean {
	return ((program.flags ?? 0) & RERUN_FLAG) === 0;
}

export function selectPrimarySyobocalPrograms(
	mappings: readonly SyobocalScheduleMapping[],
	titles: readonly SyobocalScheduleTitle[],
	channels: readonly SyobocalScheduleChannel[],
	programs: readonly SyobocalScheduleProgram[],
): PrimarySyobocalProgram[] {
	const titleByTid = new Map(titles.map((title) => [title.tid, title]));
	const channelByChid = new Map(channels.map((channel) => [channel.chid, channel]));
	const selected: PrimarySyobocalProgram[] = [];

	for (const mapping of mappings) {
		const title = titleByTid.get(mapping.tid);
		const preferredChannel = title?.firstChannel ? normalizeChannelName(title.firstChannel) : null;
		const isPreferred = (program: SyobocalScheduleProgram) => {
			if (!preferredChannel) return false;
			const channel = channelByChid.get(program.chid);
			return (
				normalizeChannelName(channel?.name ?? "") === preferredChannel ||
				normalizeChannelName(channel?.epgName ?? "") === preferredChannel
			);
		};
		const eligible = programs.filter((program) => {
			if (program.tid !== mapping.tid || program.deleted) return false;
			if (!isSchedulableProgram(program)) return false;
			if (channelTier(channelByChid.get(program.chid)) === null) return false;
			// クール境界は放送日慣習で判定する（9/30深夜25:30の枠は9月クール側）
			const date = jstBroadcastDate(program.startsAt);
			return (!mapping.validFrom || date >= mapping.validFrom) && (!mapping.validTo || date <= mapping.validTo);
		});
		// 最速局ロック: 最大話数を最も早く放送する局（地上波優先）を主局とし、
		// その局の枠だけを使う。遅れネット局で今も放送中の旧話が「その話の最速」
		// として紛れ込み、本放送より古い話数のルームが立つのを防ぐ。
		const numbered = eligible.filter((program) => program.episodeNumber !== null);
		let primaryChid: number | null = null;
		for (const tier of [0, 1]) {
			const tierNumbered = numbered.filter((program) => channelTier(channelByChid.get(program.chid)) === tier);
			if (tierNumbered.length === 0) continue;
			const maxEpisode = Math.max(...tierNumbered.map((program) => program.episodeNumber ?? 0));
			const leader = tierNumbered
				.filter((program) => program.episodeNumber === maxEpisode)
				.sort(
					(left, right) =>
						Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
						Number(isPreferred(right)) - Number(isPreferred(left)) ||
						left.pid - right.pid,
				)[0];
			if (leader) primaryChid = leader.chid;
			break;
		}
		const pool = primaryChid !== null ? eligible.filter((program) => program.chid === primaryChid) : eligible;

		const byEpisode = new Map<string, SyobocalScheduleProgram[]>();
		for (const program of pool) {
			const key = episodeIdentity(program);
			const values = byEpisode.get(key) ?? [];
			values.push(program);
			byEpisode.set(key, values);
		}

		for (const candidates of byEpisode.values()) {
			// Earliest airing on the best available tier (terrestrial before BS);
			// the title's home channel only breaks exact same-time ties.
			const chosen = [...candidates].sort(
				(left, right) =>
					(channelTier(channelByChid.get(left.chid)) ?? 9) -
						(channelTier(channelByChid.get(right.chid)) ?? 9) ||
					Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
					Number(isPreferred(right)) - Number(isPreferred(left)) ||
					left.pid - right.pid,
			)[0];
			if (!chosen) continue;
			const channel = channelByChid.get(chosen.chid);
			if (!channel) continue;
			selected.push({ ...chosen, malId: mapping.malId, channelName: channel.name });
		}
	}

	return selected.sort(
		(left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.pid - right.pid,
	);
}

function addUtcDays(value: string, days: number): string {
	const date = new Date(`${value}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export function rollingSyobocalProgramRange(
	seasonStart: string,
	seasonEnd: string,
	now: Date = new Date(),
): { startDate: string; endDate: string; apiRange: string } | null {
	const today = jstDate(now);
	const rollingStart = addUtcDays(today, -1);
	const rollingEnd = addUtcDays(today, 91);
	const startDate = seasonStart > rollingStart ? seasonStart : rollingStart;
	const endDate = seasonEnd < rollingEnd ? seasonEnd : rollingEnd;
	if (startDate >= endDate) return null;
	const format = (value: string) => `${value.replaceAll("-", "")}_000000`;
	return { startDate, endDate, apiRange: `${format(startDate)}-${format(endDate)}` };
}
