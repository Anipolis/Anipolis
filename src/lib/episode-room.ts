import type { RoomAiring } from "$lib/types";

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
