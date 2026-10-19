import { fail } from "@sveltejs/kit";
import { airingOnAirAt } from "$lib/episode-room";
import { insertPostWithHashtags } from "$lib/server/actions";
import { getEpisodeRoomAirings, getEpisodeRoomPosts } from "$lib/server/queries";
import { roomHashtag, stripTrailingRoomHashtag } from "$lib/server/room-hashtag";
import type { Anime, EpisodeRoom } from "$lib/types";

/**
 * 話数ルーム・特番ルーム（153）のページの共通部分。
 * /rooms/anime/[id]/ep/[n] と /rooms/anime/[id]/sp/[key] が、ルームを解決したあとにこれを使う。
 */

/** 投稿の受付に終わりは無いので、LiveRoomView の締切には十分先の時刻を渡す（総合ロビーと同じ） */
export const NEVER_CLOSES = "9999-12-31T23:59:59.000Z";

type Supabase = App.Locals["supabase"];
type User = Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"];

/** ルームのページのデータ（LiveRoomData の形）。room が null なら「まだ投稿できない」ページになる */
export async function buildEpisodeRoomPageData(input: {
	supabase: Supabase;
	user: User;
	url: URL;
	anime: Anime;
	room: EpisodeRoom | null;
	title: string;
	episodeNumber: number | null;
}) {
	const { supabase, user, url, anime, room, title, episodeNumber } = input;
	const airings = room ? await getEpisodeRoomAirings(supabase, room.id) : [];
	const now = Date.now();
	const liveAiring = airingOnAirAt(airings, now);
	const requestedAiringId = url.searchParams.get("airing");
	const initialAiringId = airings.some((airing) => airing.id === requestedAiringId) ? requestedAiringId : null;
	const firstAiring = airings.find((airing) => airing.airing_kind === "first") ?? airings[0] ?? null;

	const initialAiring = airings.find((airing) => airing.id === initialAiringId) ?? null;
	// 読み始める位置: ?airing= はその放送枠の開場から、放送中は最新から、それ以外はルームの最初から
	const from = initialAiring ? "start" : liveAiring ? "latest" : "start";
	const since = initialAiring?.posting_opens_at;
	const [postPage, olderExists] = await Promise.all([
		room
			? getEpisodeRoomPosts(supabase, room.id, user?.id ?? null, { limit: 100, from, since })
			: Promise.resolve({ posts: [], hasMore: false, oldestCursor: null }),
		// 放送枠から読み始めたとき、それより前の投稿があるか（「前の投稿を読み込む」を出すか）
		room && since
			? supabase
					.from("posts")
					.select("id")
					.eq("episode_room_id", room.id)
					.is("parent_id", null)
					.lt("created_at", since)
					.limit(1)
					.then(({ data }) => (data ?? []).length > 0)
			: Promise.resolve(false),
	]);
	const posts = postPage.posts;
	// 最新から読んだときは、取得した行（除外前）が上限に達していれば前にも投稿がある
	const hasOlderPosts = since ? olderExists : from === "latest" && postPage.hasMore;

	// 開く時刻が決まっていない話は「まだ投稿できない」状態にする（開場は十分先として渡す）
	const opensAt = room?.opens_at ?? NEVER_CLOSES;
	const scheduledAt = firstAiring?.scheduled_at ?? room?.opens_at ?? NEVER_CLOSES;

	return {
		anime,
		room: {
			session_id: room?.id ?? "",
			date: scheduledAt.slice(0, 10),
			kind: "episode_room" as const,
			hashtag: roomHashtag(anime),
			scheduled_at: scheduledAt,
			posting_opens_at: opensAt,
			posting_closes_at: NEVER_CLOSES,
			duration_minutes: firstAiring
				? Math.round((Date.parse(firstAiring.ends_at) - Date.parse(firstAiring.scheduled_at)) / 60_000)
				: null,
			title,
			...(episodeNumber != null ? { episode_number: episodeNumber } : {}),
			opens_at_known: room?.opens_at != null,
			airings,
			initial_airing_id: initialAiringId,
			has_older_posts: hasOlderPosts,
			// 前へ読み足す境界（ミュート・ブロックで除外する前の最古の行）
			older_cursor: postPage.oldestCursor,
		},
		posts,
		user,
		// 実験・退室アンケートは放送枠（セッション）単位の仕組みなので、話数ルームでは使わない
		roomExperiment: { enabled: false },
		roomExitSurvey: {
			experimentRunId: null,
			alreadyAnswered: true,
			postCount: 0,
			surveyVersion: "",
		},
	};
}

/** ルームへの投稿。ルームが開いていなければ投稿させない */
export async function createEpisodeRoomPost(input: {
	supabase: Supabase;
	userId: string;
	request: Request;
	anime: Anime;
	room: EpisodeRoom | null;
}) {
	const { supabase, userId, request, anime, room } = input;
	if (!room || room.merged_into) return fail(404, { message: "ルームが見つかりません" });
	if (!room.opens_at || Date.parse(room.opens_at) > Date.now()) {
		return fail(403, { message: "まだ放送されていないため、投稿できません" });
	}

	const form = await request.formData();
	const rawContent = (form.get("content") as string | null) ?? "";
	const hashtag = roomHashtag(anime);
	const content = stripTrailingRoomHashtag(rawContent, hashtag);
	if (!content) return fail(400, { message: "投稿内容を入力してください" });

	// 放送枠の時間内なら、DB のトリガー（153）が放送枠も補う
	return insertPostWithHashtags(
		supabase,
		userId,
		content,
		null,
		[],
		anime.id,
		null,
		null,
		null,
		null,
		[hashtag],
		null,
		room.id,
	);
}
