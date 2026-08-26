import { error, fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { buildBroadcastEpisodeLog } from "$lib/server/broadcast-episode-log";
import {
	getAnime,
	getAnimeRankingTrending,
	getBroadcastRoomOverride,
	getBroadcastRoomOverridesForAnime,
	getBroadcastRoomPosts,
	getBroadcastRoomScheduleSnapshotsForAnime,
	getBroadcastRoomSession,
} from "$lib/server/queries";
import { getRoomExitSurveyLoadState, ROOM_EXIT_SURVEY_VERSION } from "$lib/server/room-exit-survey";
import {
	createRoomExperimentServiceClient,
	getActiveRoomExperimentRunForAnime as getActiveExperimentRun,
} from "$lib/server/room-experiments";
import type { Anime, BroadcastRoomOverride, BroadcastRoomSession } from "$lib/types";
import { animeIsScheduledForRoomDate, broadcastTimeMinutes, isEligibleForRoomLog } from "$lib/utils/broadcast-room";
import type { Actions, PageServerLoad } from "./$types";

// 過去ルームの表示専用セッション。かつては閲覧時にフォールバックがセッション行を
// 偽装生成して表示していたが、しょぼい絶対化でDBへの偽装生成を廃止したため、
// 「行が無い閉場済みルーム」はこの合成オブジェクトで履歴閲覧だけを復元する
// （投稿は締切済みで不可、投稿・アンケート等の参照は空を返す）。
const SYNTHETIC_ROOM_SESSION_ID = "00000000-0000-0000-0000-000000000000";

function synthesizeClosedRoomSession(
	anime: Anime,
	roomDate: string,
	override: BroadcastRoomOverride | null,
): BroadcastRoomSession | null {
	const time = override?.broadcast_time ?? anime.broadcast_time;
	const minutes = broadcastTimeMinutes(time);
	if (minutes == null) return null;
	const [year, month, day] = roomDate.split("-").map((part) => Number.parseInt(part, 10));
	if (!year || !month || !day) return null;
	// JST固定(+9): サーバーTZに依存させない
	const scheduledMs = Date.UTC(year, month - 1, day, Math.floor(minutes / 60) - 9, minutes % 60);
	const duration = override?.duration_minutes ?? anime.broadcast_duration_minutes ?? 30;
	const preOpen = override?.pre_open_minutes ?? anime.broadcast_room_pre_open_minutes ?? 5;
	const postClose = override?.post_close_minutes ?? anime.broadcast_room_post_close_minutes ?? 30;
	const closesMs = scheduledMs + (duration + postClose) * 60_000;
	// 未来・開催中のルームは実セッション（しょぼい同期かオーバーライド起点）が必須
	if (closesMs > Date.now()) return null;
	return {
		id: SYNTHETIC_ROOM_SESSION_ID,
		anime_id: Number(anime.id),
		room_date: roomDate,
		room_kind: "episode",
		room_key: roomDate,
		scheduled_at: new Date(scheduledMs).toISOString(),
		duration_minutes: duration,
		posting_opens_at: new Date(scheduledMs - preOpen * 60_000).toISOString(),
		posting_closes_at: new Date(closesMs).toISOString(),
	};
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

	// 実セッション（しょぼい同期・オーバーライド起点）が最優先。深夜枠は
	// room_dateが放送日（前日）でMAL由来のbroadcast_dayと曜日が一致しないため、
	// 曜日ゲートは実セッションが無い場合の合成時にだけ適用する。
	let session = await getBroadcastRoomSession(supabase, anime.id, params.date);
	if (!session) {
		// ルーム対象外シーズン（2026-winter以前）は閉場済みルームも生成しない
		if (!isEligibleForRoomLog(anime.season)) {
			throw error(404, "放送ルームが見つかりません");
		}
		if (!animeIsScheduledForRoomDate(anime, params.date, override != null)) {
			throw error(404, "放送ルームが見つかりません");
		}
		session = synthesizeClosedRoomSession(anime, params.date, override ?? null);
	}
	if (!session) throw error(404, "放送ルームが見つかりません");

	const hashtag = roomHashtag(anime);
	// 話数はしょぼい番組表由来の値が第一。番号の無いセッション（同期開始前の
	// 実在・合成ルーム）は、詳細ページのルームログと同じアンカー逆算で補う
	// （曜日からの機械カウントはしない）。一挙放送等の範囲はタイトルに使わない。
	let episodeNumber = session.episode_number ?? null;
	if (episodeNumber == null && isEligibleForRoomLog(anime.season)) {
		const [snapshots, overrides] = await Promise.all([
			getBroadcastRoomScheduleSnapshotsForAnime(supabase, Number(anime.id)),
			getBroadcastRoomOverridesForAnime(supabase, params.id),
		]);
		const slot = buildBroadcastEpisodeLog(anime, snapshots, overrides).find((entry) => entry.date === params.date);
		if (slot && slot.start != null && slot.start === slot.end) episodeNumber = slot.start;
	}
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
		if (!anime) return fail(404, { message: "放送ルームが見つかりません" });

		// 表示側と同じ判定順: 実セッション（しょぼい同期・オーバーライド起点）が
		// あれば曜日ゲートを通さない。深夜枠は room_date が放送日（前日）で
		// MAL由来の broadcast_day と一致しないため、ゲート先行だと投稿が404になる。
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

		return insertPostWithHashtags(supabase, user.id, content, null, [], anime.id, null, null, session.id, null, [
			hashtag,
		]);
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
