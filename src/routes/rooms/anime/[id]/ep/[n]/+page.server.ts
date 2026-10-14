import { error, fail, redirect } from "@sveltejs/kit";
import { airingOnAirAt, episodeRoomPath, hasEpisodeRooms, parseEpisodeNumberParam } from "$lib/episode-room";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import {
	ensureEpisodeRoom,
	getAnime,
	getAnimeRankingTrending,
	getEpisodeRoomAirings,
	getEpisodeRoomById,
	getEpisodeRoomByNumber,
	getEpisodeRoomPosts,
} from "$lib/server/queries";
import { roomHashtag, stripTrailingRoomHashtag } from "$lib/server/room-hashtag";
import type { EpisodeRoom } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

/**
 * 話数ルーム（実況ルームの話数単位化・153）。作品×話数のルームで、投稿の期限は無い。
 * 放送枠（初回・再放送・イベント）はルームの中の区切りとして見出しに使う。
 */

/** 投稿の受付に終わりは無いので、LiveRoomView の締切には十分先の時刻を渡す（総合ロビーと同じ） */
const NEVER_CLOSES = "9999-12-31T23:59:59.000Z";

type AnimeRoomInfo = { type: string | null; room_type: string | null; episode_total: number | null };

async function getAnimeRoomInfo(supabase: App.Locals["supabase"], animeId: number): Promise<AnimeRoomInfo | null> {
	// episode_total（152）は作品の一覧ビューに含まれないので anime から直接読む
	const { data } = await supabase
		.from("anime")
		.select("type, room_type, episode_total")
		.eq("id", animeId)
		.maybeSingle();
	return data ?? null;
}

/** 話数ルームを探し、無ければ開いてよいか DB に判断させて作る。統合済みなら統合先を返す */
async function resolveEpisodeRoom(
	supabase: App.Locals["supabase"],
	animeId: number,
	episodeNumber: number,
): Promise<EpisodeRoom | null> {
	let room = await getEpisodeRoomByNumber(supabase, animeId, episodeNumber);
	if (!room) room = await ensureEpisodeRoom(supabase, animeId, episodeNumber);
	if (room?.merged_into) room = (await getEpisodeRoomById(supabase, room.merged_into)) ?? room;
	return room;
}

export const load: PageServerLoad = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const episodeNumber = parseEpisodeNumberParam(params.n);
	if (episodeNumber == null) throw error(404, "ルームが見つかりません");

	const anime = await getAnime(supabase, params.id, user?.id ?? null);
	if (!anime) throw error(404, "アニメが見つかりません");
	const animeId = Number(anime.id);
	const info = await getAnimeRoomInfo(supabase, animeId);

	const room = await resolveEpisodeRoom(supabase, animeId, episodeNumber);
	if (room && room.kind === "episode" && room.episode_number != null && room.episode_number !== episodeNumber) {
		// 統合先の話数へ（元の URL のクエリは引き継がない）
		redirect(302, episodeRoomPath(animeId, room.episode_number));
	}
	if (!room) {
		// ルームがまだ無い話: 話数のある作品の範囲内なら「まだ投稿できない」ページとして見せる
		const inRange =
			info != null &&
			hasEpisodeRooms(info) &&
			(info.episode_total == null || episodeNumber <= info.episode_total);
		if (!inRange) throw error(404, "ルームが見つかりません");
	}

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
	const [posts, trending, animeTrending, olderExists] = await Promise.all([
		room
			? getEpisodeRoomPosts(supabase, room.id, user?.id ?? null, { limit: 100, from, since })
			: Promise.resolve([]),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
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
	const hasOlderPosts = since ? olderExists : from === "latest" && posts.length >= 100;

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
			title: `${anime.title} 第${episodeNumber}話`,
			episode_number: episodeNumber,
			opens_at_known: room?.opens_at != null,
			airings,
			initial_airing_id: initialAiringId,
			has_older_posts: hasOlderPosts,
		},
		posts,
		trending: trending.data ?? [],
		animeTrending,
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
};

export const actions: Actions = {
	createPost: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const episodeNumber = parseEpisodeNumberParam(params.n);
		const anime = episodeNumber == null ? null : await getAnime(supabase, params.id, user.id);
		if (!anime || episodeNumber == null) return fail(404, { message: "ルームが見つかりません" });

		const room = await resolveEpisodeRoom(supabase, Number(anime.id), episodeNumber);
		if (!room || room.merged_into) return fail(404, { message: "ルームが見つかりません" });
		if (!room.opens_at || Date.parse(room.opens_at) > Date.now()) {
			return fail(403, { message: "この話はまだ放送されていないため、投稿できません" });
		}

		const form = await request.formData();
		const rawContent = (form.get("content") as string | null) ?? "";
		const hashtag = roomHashtag(anime);
		const content = stripTrailingRoomHashtag(rawContent, hashtag);
		if (!content) return fail(400, { message: "投稿内容を入力してください" });

		// 放送枠の時間内なら、DB のトリガー（153）が放送枠も補う
		return insertPostWithHashtags(
			supabase,
			user.id,
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
	},

	deletePost: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return deletePostAction(request, supabase, user.id);
	},

	like: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleLikeAction(request, supabase, user.id);
	},

	repost: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleRepostAction(request, supabase, user.id);
	},

	bookmark: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleBookmarkAction(request, supabase, user.id);
	},
};
