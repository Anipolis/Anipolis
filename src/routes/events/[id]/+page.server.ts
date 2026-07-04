import { error, fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { getAnime, getAnimeRankingTrending, getEvent, getEventRoomPosts } from "$lib/server/queries";
import { extractHashtags } from "$lib/utils/hashtag";
import type { Actions, PageServerLoad } from "./$types";

const DEFAULT_EVENT_DURATION_MINUTES = 6 * 60;

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	// イベントルームはリアルタイムルームの放送日ウィンドウ制限（animeIsScheduledForDate 相当）の対象外。
	// アニメに紐づいていないイベントや、放送スケジュールと無関係な単発イベントも成立させるため意図的に外している。
	const { user } = await safeGetSession();

	const event = await getEvent(supabase, params.id);
	if (!event) throw error(404, "イベントが見つかりません");

	const [anime, posts, trending, animeTrending] = await Promise.all([
		event.anime_id ? getAnime(supabase, event.anime_id, user?.id ?? null) : Promise.resolve(null),
		getEventRoomPosts(supabase, event.id, user?.id ?? null, { limit: 100, ascending: true }),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	const scheduledMs = new Date(event.scheduled_at).getTime();
	const durationMinutes = event.duration_minutes ?? DEFAULT_EVENT_DURATION_MINUTES;
	const postingClosesAt = new Date(scheduledMs + durationMinutes * 60 * 1000).toISOString();

	return {
		anime,
		room: {
			session_id: event.id,
			date: event.scheduled_at.slice(0, 10),
			kind: "event" as const,
			hashtag: event.hashtag,
			scheduled_at: event.scheduled_at,
			posting_opens_at: event.scheduled_at,
			posting_closes_at: postingClosesAt,
			duration_minutes: event.duration_minutes,
			title: event.title,
		},
		posts,
		trending: trending.data ?? [],
		animeTrending,
		user,
		roomExperiment: {
			enabled: false,
		},
		roomExitSurvey: {
			experimentRunId: null,
			alreadyAnswered: true,
			postCount: 0,
			surveyVersion: "n/a",
		},
	};
};

export const actions: Actions = {
	// イベントルームへの投稿（ハッシュタグを自動付与）
	createPost: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const content = (form.get("content") as string | null)?.trim() ?? "";
		if (!content) return fail(400, { message: "投稿内容を入力してください" });
		const event = await getEvent(supabase, params.id);
		if (!event) return fail(404, { message: "イベントが見つかりません" });
		if (event.is_cancelled) return fail(404, { message: "イベントが見つかりません" });

		const scheduledMs = new Date(event.scheduled_at).getTime();
		const durationMinutes = event.duration_minutes ?? DEFAULT_EVENT_DURATION_MINUTES;
		const postingClosesAtMs = scheduledMs + durationMinutes * 60 * 1000;
		const now = Date.now();
		if (now < scheduledMs) return fail(403, { message: "このイベントはまだ投稿を受け付けていません" });
		if (now > postingClosesAtMs) return fail(403, { message: "このイベントの投稿受付は終了しました" });

		const hashtag = event.hashtag;
		const animeId = event.anime_id;

		// ハッシュタグが含まれていなければ自動付与
		const hasTag = extractHashtags(content).includes(hashtag.toLowerCase());
		const finalContent = hasTag ? content : `${content} #${hashtag}`;

		return insertPostWithHashtags(
			supabase,
			user.id,
			finalContent,
			null,
			[],
			animeId,
			null,
			null,
			null,
			null,
			[hashtag],
			event.id,
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
