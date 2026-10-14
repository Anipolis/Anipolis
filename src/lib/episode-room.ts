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

/**
 * いま放送中（開場から放送の終わりまで）の放送枠。放送後の感想受付の時間は含めない。
 * 「放送中」の表示・「ライブ開始地点へ」・ポーリングの間隔に使う（投稿の分類は airingAt）
 */
export function airingOnAirAt(airings: readonly RoomAiring[], at: number): RoomAiring | null {
	let found: RoomAiring | null = null;
	for (const airing of airings) {
		if (at < Date.parse(airing.posting_opens_at) || at > Date.parse(airing.ends_at)) continue;
		if (!found || Date.parse(airing.posting_opens_at) > Date.parse(found.posting_opens_at)) found = airing;
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
	/** 特番のルームのページはまだ無いので null（リンクにしない） */
	href: string | null;
	/** 投稿を受け付け始める時刻。null はまだ決まっていない（未放送） */
	opensAt: string | null;
	/** 初回放送の放送日（朝4時区切りの JST の日付、YYYY-MM-DD。放送枠が無ければ null） */
	firstAiredOn: string | null;
	/** 放送中の判定に使う、放送枠の開場から放送の終わりまで */
	windows: { opens: string; closes: string }[];
}

/** room_date は放送日（朝4時区切り）。無ければ開始時刻の JST の日付を使う */
type RoomAiringWithRoom = RoomAiring & { episode_room_id: string; room_date?: string };

/** まだルームが無いが、開けば DB（153 の ensure_episode_room）がすぐ作って開く話に付ける開く時刻 */
const OPENABLE_WITHOUT_ROOM = new Date(0).toISOString();

/**
 * ルームがまだ無くても開ける最後の話数（153 の ensure_episode_room と同じ判断）。
 *   * 放送枠のある作品: 開場済みの放送枠の最大話数まで
 *   * 放送枠の無い作品: 放送終了（finished）か、配信開始日を過ぎた ONA / OVA なら作品の話数まで
 */
export function openableEpisodeLimit(input: {
	anime: { type: string | null; status: string | null; aired_from: string | null; episode_total: number | null };
	rooms: readonly EpisodeRoom[];
	airings: readonly RoomAiringWithRoom[];
	now: number;
}): number {
	const { anime, rooms, airings, now } = input;
	const roomNumber = new Map(rooms.map((room) => [room.id, room.episode_number]));
	const airedNumbers = airings
		.filter((airing) => Date.parse(airing.posting_opens_at) <= now)
		.map((airing) => roomNumber.get(airing.episode_room_id))
		.filter((n): n is number => n != null);
	if (airedNumbers.length > 0) return Math.max(...airedNumbers);
	if (anime.episode_total == null) return 0;
	if (anime.status === "finished") return anime.episode_total;
	const todayJst = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
	if ((anime.type === "ONA" || anime.type === "OVA") && anime.aired_from && anime.aired_from <= todayJst) {
		return anime.episode_total;
	}
	return 0;
}

/**
 * 作品ページに並べる話数ルームの一覧。第1話から作品の話数（無ければ作られたルームの最大話数）までと、特番。
 * ルームがまだ無い話は、開ける話（openableUpTo 以下）なら投稿できる行、それ以外は未放送の行として出す。
 * 統合済みのルームの話数は出さない（開くと統合先へ転送される）。
 */
export function buildEpisodeRoomList(input: {
	animeId: number | string;
	rooms: readonly EpisodeRoom[];
	airings: readonly RoomAiringWithRoom[];
	episodeTotal: number | null;
	openableUpTo?: number;
}): EpisodeRoomListEntry[] {
	const { animeId, rooms, airings, episodeTotal, openableUpTo = 0 } = input;
	const live = rooms.filter((room) => !room.merged_into);
	const airingsByRoom = new Map<string, RoomAiringWithRoom[]>();
	for (const airing of airings) {
		const list = airingsByRoom.get(airing.episode_room_id) ?? [];
		list.push(airing);
		airingsByRoom.set(airing.episode_room_id, list);
	}

	const toEntry = (
		room: EpisodeRoom | undefined,
		base: Omit<EpisodeRoomListEntry, "opensAt" | "firstAiredOn" | "windows">,
	): EpisodeRoomListEntry => {
		const roomAirings = room ? (airingsByRoom.get(room.id) ?? []) : [];
		const first = roomAirings
			.filter((airing) => airing.airing_kind === "first")
			.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
		const openable = !room && base.episodeNumber != null && base.episodeNumber <= openableUpTo;
		return {
			...base,
			opensAt: room?.opens_at ?? (openable ? OPENABLE_WITHOUT_ROOM : null),
			firstAiredOn: first ? (first.room_date ?? formatAiringDate(first.scheduled_at)) : null,
			windows: roomAirings.map((airing) => ({ opens: airing.posting_opens_at, closes: airing.ends_at })),
		};
	};

	const byNumber = new Map(
		live
			.filter((room) => room.kind === "episode" && room.episode_number != null)
			.map((room) => [room.episode_number, room]),
	);
	// 統合して消えた話数（同じ話数の生きたルームが無いもの）は一覧に出さない
	const mergedNumbers = new Set(
		rooms
			.filter((room) => room.merged_into && room.kind === "episode" && room.episode_number != null)
			.map((room) => room.episode_number)
			.filter((n) => !byNumber.has(n)),
	);
	const maxRoomNumber = Math.max(0, ...[...byNumber.keys()].filter((n): n is number => n != null));
	const lastEpisode = Math.max(episodeTotal ?? 0, maxRoomNumber);

	const entries: EpisodeRoomListEntry[] = [];
	for (let n = 1; n <= lastEpisode; n += 1) {
		if (mergedNumbers.has(n)) continue;
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
				// 特番ルームのページは管理画面と一緒に作る。それまではリンクにしない
				href: null,
			}),
		);
	}
	return entries;
}

/** 行の状態。open: 投稿できる / upcoming: 開く時刻が決まっている / unaired: まだ決まっていない */
export function episodeRoomEntryState(
	entry: Pick<EpisodeRoomListEntry, "opensAt">,
	now: number,
): "open" | "upcoming" | "unaired" {
	if (!entry.opensAt) return "unaired";
	return Date.parse(entry.opensAt) <= now ? "open" : "upcoming";
}

/** 放送中（放送枠の開場から放送の終わりまで）の行か（作品ページの LIVE 表示） */
export function isEpisodeRoomEntryLive(entry: Pick<EpisodeRoomListEntry, "windows">, now: number): boolean {
	return entry.windows.some((window) => Date.parse(window.opens) <= now && now <= Date.parse(window.closes));
}

/** JST の日付（YYYY-MM-DD）。深夜0〜9時の放送が UTC で前日にならないように */
export function formatAiringDate(iso: string): string {
	return new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
