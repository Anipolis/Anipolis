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

function episodeIdentity(program: SyobocalScheduleProgram): string {
	if (program.episodeNumber !== null) return `episode:${program.episodeNumber}`;
	if (program.subtitle) return `subtitle:${program.subtitle.normalize("NFKC").trim()}`;
	return "unnumbered";
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
// Unnumbered slots whose subtitle marks a recap/special are not episodes;
// numbered ones are kept even when labeled (e.g. an in-sequence recap counted
// by the broadcaster still opens its scheduled room).
const RECAP_SUBTITLE =
	/総集編|一挙|振り返り|ダイジェスト|特別編|特番|傑作選|セレクション|放送直前|直前スペシャル|おさらい/;

function isSchedulableProgram(program: SyobocalScheduleProgram): boolean {
	if (((program.flags ?? 0) & RERUN_FLAG) !== 0) return false;
	if (program.episodeNumber === null && program.subtitle && RECAP_SUBTITLE.test(program.subtitle.normalize("NFKC")))
		return false;
	return true;
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
		const eligible = programs.filter((program) => {
			if (program.tid !== mapping.tid || program.deleted) return false;
			if (!isSchedulableProgram(program)) return false;
			if (channelTier(channelByChid.get(program.chid)) === null) return false;
			const date = jstDate(program.startsAt);
			return (!mapping.validFrom || date >= mapping.validFrom) && (!mapping.validTo || date <= mapping.validTo);
		});
		const byEpisode = new Map<string, SyobocalScheduleProgram[]>();
		for (const program of eligible) {
			const key = episodeIdentity(program);
			const values = byEpisode.get(key) ?? [];
			values.push(program);
			byEpisode.set(key, values);
		}

		for (const candidates of byEpisode.values()) {
			// Earliest airing on the best available tier (terrestrial before BS);
			// the title's home channel only breaks exact same-time ties.
			const isPreferred = (program: SyobocalScheduleProgram) => {
				if (!preferredChannel) return false;
				const channel = channelByChid.get(program.chid);
				return (
					normalizeChannelName(channel?.name ?? "") === preferredChannel ||
					normalizeChannelName(channel?.epgName ?? "") === preferredChannel
				);
			};
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
