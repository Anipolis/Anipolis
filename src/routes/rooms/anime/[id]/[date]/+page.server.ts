import { error, fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import {
	getAnime,
	getAnimeRankingTrending,
	getBroadcastRoomOverride,
	getBroadcastRoomPosts,
	getBroadcastRoomSession,
} from "$lib/server/queries";
import { getRoomExitSurveyLoadState, ROOM_EXIT_SURVEY_VERSION } from "$lib/server/room-exit-survey";
import {
	createRoomExperimentServiceClient,
	getActiveRoomExperimentRunForAnime as getActiveExperimentRun,
} from "$lib/server/room-experiments";
import type { Anime } from "$lib/types";
import { calcEpisodeNumberFromDate } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

function dateKeyToDate(value: string) {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const date = new Date(`${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function animeIsScheduledForDate(anime: Anime, dateKey: string, hasOverride: boolean) {
	const date = dateKeyToDate(dateKey);
	if (!date) return false;
	if (!hasOverride && (anime.broadcast_day == null || date.getDay() !== anime.broadcast_day)) return false;

	const airedFrom = anime.aired_from?.slice(0, 10) ?? null;
	if (airedFrom && dateKey < airedFrom) return false;

	const airedTo = anime.aired_to?.slice(0, 10) ?? null;
	if (airedTo && dateKey > airedTo) return false;

	return true;
}

function fallbackRoomHashtag(title: string) {
	return title.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_]/gu, "");
}

function normalizeHashtag(value: string) {
	return value.trim().replace(/^#+/, "").toLowerCase();
}

function roomHashtag(anime: Anime) {
	const officialHashtag = anime.official_hashtag?.map(normalizeHashtag).find((tag) => tag.length > 0);
	return officialHashtag ?? fallbackRoomHashtag(anime.title);
}

function stripTrailingRoomHashtag(content: string, hashtag: string) {
	const tag = normalizeHashtag(hashtag);
	if (!tag) return content.trim();
	const trimmed = content.trim();
	const normalized = trimmed.toLowerCase();
	const suffix = `#${tag}`;
	if (!normalized.endsWith(suffix)) return trimmed;
	const before = trimmed.slice(0, trimmed.length - suffix.length);
	if (before.length > 0 && !/\s$/.test(before)) return trimmed;
	return before.trimEnd();
}

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const anime = await getAnime(supabase, params.id, user?.id ?? null);
	if (!anime) throw error(404, "アニメが見つかりません");

	const override = await getBroadcastRoomOverride(supabase, params.id, params.date);
	if (override?.is_cancelled) {
		throw error(404, "放送ルームが見つかりません");
	}
	if (!animeIsScheduledForDate(anime, params.date, override != null)) {
		throw error(404, "放送ルームが見つかりません");
	}

	const session = await getBroadcastRoomSession(supabase, anime.id, params.date);
	if (!session) throw error(404, "放送ルームが見つかりません");

	const hashtag = roomHashtag(anime);
	const episodeNumber = calcEpisodeNumberFromDate(session.room_date, anime.aired_from, anime.broadcast_time);
	const roomExperimentSupabase = user ? createRoomExperimentServiceClient() : null;
	const [posts, trending, animeTrending, roomExperimentRun, roomExitSurveyLoadState] = await Promise.all([
		getBroadcastRoomPosts(supabase, session.id, user?.id ?? null, { limit: 100, ascending: true }),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
		roomExperimentSupabase ? getActiveExperimentRun(roomExperimentSupabase, anime.id) : Promise.resolve(null),
		getRoomExitSurveyLoadState(supabase, user?.id, session.id),
	]);

	return {
		anime,
		room: {
			session_id: session.id,
			date: params.date,
			kind: "episode" as const,
			hashtag,
			scheduled_at: session.scheduled_at,
			posting_opens_at: session.posting_opens_at,
			posting_closes_at: session.posting_closes_at,
			duration_minutes: session.duration_minutes,
			title: episodeNumber != null ? `${anime.title} ${episodeNumber}話` : `${anime.title} 放送ルーム`,
		},
		posts,
		trending: trending.data ?? [],
		animeTrending,
		user,
		roomExperiment: {
			enabled: Boolean(user && roomExperimentRun),
			sessionId: roomExperimentRun ? session.id : undefined,
		},
		roomExitSurvey: {
			experimentRunId: roomExperimentRun?.id ?? null,
			alreadyAnswered: roomExitSurveyLoadState.alreadyAnswered,
			postCount: roomExitSurveyLoadState.postCount,
			surveyVersion: ROOM_EXIT_SURVEY_VERSION,
		},
	};
};

export const actions: Actions = {
	createPost: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const anime = await getAnime(supabase, params.id, user.id);
		const override = await getBroadcastRoomOverride(supabase, params.id, params.date);
		if (override?.is_cancelled) {
			return fail(404, { message: "放送ルームが見つかりません" });
		}
		if (!anime || !animeIsScheduledForDate(anime, params.date, override != null)) {
			return fail(404, { message: "放送ルームが見つかりません" });
		}

		const session = await getBroadcastRoomSession(supabase, anime.id, params.date);
		if (!session) return fail(404, { message: "放送ルームが見つかりません" });
		const now = Date.now();
		if (now < new Date(session.posting_opens_at).getTime()) {
			return fail(403, { message: "このルームはまだ投稿を受け付けていません" });
		}
		if (now > new Date(session.posting_closes_at).getTime()) {
			return fail(403, { message: "このルームの投稿受付は終了しました" });
		}

		const form = await request.formData();
		const rawContent = (form.get("content") as string | null) ?? "";
		const hashtag = roomHashtag(anime);
		const content = stripTrailingRoomHashtag(rawContent, hashtag);
		if (!content) return fail(400, { message: "投稿内容を入力してください" });

		return insertPostWithHashtags(supabase, user.id, content, null, [], anime.id, null, null, session.id, null, []);
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
