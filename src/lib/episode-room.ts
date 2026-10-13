import type { EpisodeRoom, RoomAiring } from "$lib/types";

/**
 * 話数ルーム（実況ルームの話数単位化）の、クライアントからも使う判定と表示。
 * 開くかどうかの最終判断は DB（153 の ensure_episode_room と投稿トリガー）が行う。
 */

/** 話数ルームを持つ作品か（153 の ensure_episode_room と同じ条件）。映画・特番・1話だけの配信作品は持たない */
export function hasEpisodeRooms(anime: {
	type: string | null;
	room_type?: string | null;
	episode_total?: number | null;
}): boolean {
	if (anime.room_type === "global") return false;
	if (anime.type === "TV") return true;
	return (anime.type === "ONA" || anime.type === "OVA") && (anime.episode_total ?? 0) >= 2;
}

export function episodeRoomPath(animeId: number | string, episodeNumber: number, airingId?: string | null): string {
	const base = `/rooms/anime/${animeId}/ep/${episodeNumber}`;
	return airingId ? `${base}?airing=${encodeURIComponent(airingId)}` : base;
}

/** URL の話数（正の整数だけ）。それ以外は null */
export function parseEpisodeNumberParam(value: string): number | null {
	if (!/^[1-9][0-9]{0,3}$/.test(value)) return null;
	return Number(value);
}

/** 投稿時刻が入る放送枠（投稿受付の時間帯）。重なる場合は後に始まった枠 */
export function airingAt(airings: readonly RoomAiring[], at: string | number): RoomAiring | null {
	const ms = typeof at === "number" ? at : Date.parse(at);
	let found: RoomAiring | null = null;
	for (const airing of airings) {
		const opens = Date.parse(airing.posting_opens_at);
		const closes = Date.parse(airing.posting_closes_at);
		if (ms < opens || ms > closes) continue;
		if (!found || opens > Date.parse(found.posting_opens_at)) found = airing;
	}
	return found;
}

const AIRING_KIND_LABEL: Record<RoomAiring["airing_kind"], string> = {
	first: "初回放送",
	rerun: "再放送",
	event: "イベント",
};

export function airingKindLabel(airing: Pick<RoomAiring, "airing_kind">): string {
	return AIRING_KIND_LABEL[airing.airing_kind] ?? "放送";
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** JST の「10/5(日) 23:30」。サーバーとブラウザのタイムゾーンに左右されないよう +9 時間で組み立てる */
export function formatAiringTime(iso: string): string {
	const jst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
	const hour = String(jst.getUTCHours()).padStart(2, "0");
	const minute = String(jst.getUTCMinutes()).padStart(2, "0");
	return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${WEEKDAYS[jst.getUTCDay()]}) ${hour}:${minute}`;
}

/** 放送枠の見出し（「初回放送 10/5(日) 23:30 TOKYO MX」） */
export function airingHeading(airing: RoomAiring): string {
	return [airingKindLabel(airing), formatAiringTime(airing.scheduled_at), airing.channel_name]
		.filter(Boolean)
		.join(" ");
}

/** 作品ページの話数ルーム一覧の1行 */
export interface EpisodeRoomListEntry {
	key: string;
	kind: "episode" | "special";
	episodeNumber: number | null;
	label: string;
	href: string;
	/** open: 投稿できる / upcoming: 開く時刻が決まっている / unaired: まだ決まっていない */
	state: "open" | "upcoming" | "unaired";
	/** 初回放送の開始時刻（放送枠が無ければ null） */
	firstAiredAt: string | null;
	/** 放送中の判定に使う放送枠の投稿受付の時間帯 */
	windows: { opens: string; closes: string }[];
}

type RoomAiringWithRoom = RoomAiring & { episode_room_id: string };

/**
 * 作品ページに並べる話数ルームの一覧。第1話から作品の話数（無ければ作られたルームの最大話数）までと、特番。
 * ルームがまだ無い話は「まだ放送されていない」行として出す（開いたときに作る）。
 */
export function buildEpisodeRoomList(input: {
	animeId: number | string;
	rooms: readonly EpisodeRoom[];
	airings: readonly RoomAiringWithRoom[];
	episodeTotal: number | null;
	now: number;
}): EpisodeRoomListEntry[] {
	const { animeId, rooms, airings, episodeTotal, now } = input;
	const live = rooms.filter((room) => !room.merged_into);
	const airingsByRoom = new Map<string, RoomAiringWithRoom[]>();
	for (const airing of airings) {
		const list = airingsByRoom.get(airing.episode_room_id) ?? [];
		list.push(airing);
		airingsByRoom.set(airing.episode_room_id, list);
	}

	const toEntry = (
		room: EpisodeRoom | undefined,
		base: Omit<EpisodeRoomListEntry, "state" | "firstAiredAt" | "windows">,
	) => {
		const roomAirings = room ? (airingsByRoom.get(room.id) ?? []) : [];
		const first = roomAirings
			.filter((airing) => airing.airing_kind === "first")
			.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
		const opensMs = room?.opens_at ? Date.parse(room.opens_at) : null;
		const state: EpisodeRoomListEntry["state"] = opensMs == null ? "unaired" : opensMs <= now ? "open" : "upcoming";
		return {
			...base,
			state,
			firstAiredAt: first?.scheduled_at ?? null,
			windows: roomAirings.map((airing) => ({
				opens: airing.posting_opens_at,
				closes: airing.posting_closes_at,
			})),
		};
	};

	const byNumber = new Map(
		live
			.filter((room) => room.kind === "episode" && room.episode_number != null)
			.map((room) => [room.episode_number, room]),
	);
	const maxRoomNumber = Math.max(0, ...[...byNumber.keys()].filter((n): n is number => n != null));
	const lastEpisode = Math.max(episodeTotal ?? 0, maxRoomNumber);

	const entries: EpisodeRoomListEntry[] = [];
	for (let n = 1; n <= lastEpisode; n += 1) {
		entries.push(
			toEntry(byNumber.get(n), {
				key: `ep-${n}`,
				kind: "episode",
				episodeNumber: n,
				label: `第${n}話`,
				href: episodeRoomPath(animeId, n),
			}),
		);
	}
	for (const room of live) {
		if (room.kind !== "special" || !room.special_key) continue;
		entries.push(
			toEntry(room, {
				key: `sp-${room.special_key}`,
				kind: "special",
				episodeNumber: null,
				label: room.label ?? "特番",
				href: `/rooms/anime/${animeId}/sp/${encodeURIComponent(room.special_key)}`,
			}),
		);
	}
	return entries;
}

/** 放送枠の時間内にある行か（作品ページの LIVE 表示） */
export function isEpisodeRoomEntryLive(entry: Pick<EpisodeRoomListEntry, "windows">, now: number): boolean {
	return entry.windows.some((window) => Date.parse(window.opens) <= now && now <= Date.parse(window.closes));
}
