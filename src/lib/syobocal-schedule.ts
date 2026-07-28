export type SyobocalScheduleProgram = {
	pid: number;
	tid: number;
	chid: number;
	startsAt: string;
	endsAt: string;
	episodeNumber: number | null;
	subtitle: string | null;
	deleted: boolean;
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
};

export type PrimarySyobocalProgram = SyobocalScheduleProgram & {
	malId: number;
	channelName: string;
};

function normalizeChannelName(value: string): string {
	return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
}

export function jstDate(value: string | Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(typeof value === "string" ? new Date(value) : value);
}

function episodeIdentity(program: SyobocalScheduleProgram): string {
	if (program.episodeNumber !== null) return `episode:${program.episodeNumber}`;
	if (program.subtitle) return `subtitle:${program.subtitle.normalize("NFKC").trim()}`;
	return "unnumbered";
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
			const preferred = preferredChannel
				? candidates.filter((program) => {
						const channel = channelByChid.get(program.chid);
						return (
							normalizeChannelName(channel?.name ?? "") === preferredChannel ||
							normalizeChannelName(channel?.epgName ?? "") === preferredChannel
						);
					})
				: [];
			const chosen = [...(preferred.length > 0 ? preferred : candidates)].sort(
				(left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.pid - right.pid,
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
