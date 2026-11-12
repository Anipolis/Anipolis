import { json } from "@sveltejs/kit";
import type { ComposerRoomsResponse } from "$lib/composer-rooms";
import { buildEpisodeRoomList, episodeRoomChipLabels, episodeRoomEntryState, hasEpisodeRooms } from "$lib/episode-room";
import { getAnime, getEpisodeRoomBounds, getEpisodeRoomLog, getGlobalAnimeLobbySession } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

/**
 * 作品のルームの一覧（投稿欄のルーム選び）。作品ページの話数ルームの一覧と同じ組み立てを使う。
 * 作品ルーム（総合ロビー）の作品は、その放送枠を1つ返す
 */
export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return json({ message: "ログインが必要です" }, { status: 401 });

	const anime = await getAnime(supabase, params.id, user.id);
	if (!anime) return json({ message: "作品が見つかりません" }, { status: 404 });

	if (anime.room_type === "global") {
		const session = await getGlobalAnimeLobbySession(supabase, anime.id);
		return json({ roomType: "global", lobbySessionId: session?.id ?? null } satisfies ComposerRoomsResponse);
	}

	const animeId = Number(anime.id);
	const [log, bounds] = await Promise.all([
		getEpisodeRoomLog(supabase, animeId),
		getEpisodeRoomBounds(supabase, animeId),
	]);
	if (!log || !bounds) return json({ message: "ルームを読み込めませんでした" }, { status: 500 });

	const all = buildEpisodeRoomList({ animeId: anime.id, ...log, episodeTotal: anime.episode_total, bounds });
	// 話数の無い作品（映画・1話だけの配信など）は特番ルームだけ（作品ページと同じ）
	const entries = hasEpisodeRooms(anime) ? all : all.filter((entry) => entry.kind === "special");
	const chips = episodeRoomChipLabels(entries);
	const now = Date.now();
	return json({
		roomType: "episode",
		entries: entries.map((entry) => ({
			key: entry.key,
			kind: entry.kind,
			label: entry.label,
			chip: chips.get(entry.key) ?? entry.label,
			episodeNumber: entry.episodeNumber,
			specialKey: entry.kind === "special" ? entry.key.slice("sp-".length) : null,
			open: episodeRoomEntryState(entry, now) === "open",
		})),
	} satisfies ComposerRoomsResponse);
};
