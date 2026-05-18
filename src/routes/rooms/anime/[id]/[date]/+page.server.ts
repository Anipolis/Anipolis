import { error, fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { getAnime, getEventPosts } from "$lib/server/queries";
import type { Anime } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

function dateKeyToDate(value: string) {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const date = new Date(`${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function animeIsScheduledForDate(anime: Anime, dateKey: string) {
	const date = dateKeyToDate(dateKey);
	if (!date || anime.broadcast_day == null) return false;
	if (date.getDay() !== anime.broadcast_day) return false;

	const airedFrom = anime.aired_from?.slice(0, 10) ?? null;
	if (airedFrom && dateKey < airedFrom) return false;

	const airedTo = anime.aired_to?.slice(0, 10) ?? null;
	if (airedTo && dateKey > airedTo) return false;

	return true;
}

function fallbackRoomHashtag(animeId: string, dateKey: string) {
	return `anime${animeId}_${dateKey.replaceAll("-", "")}`;
}

function normalizeHashtag(value: string) {
	return value.trim().replace(/^#+/, "").toLowerCase();
}

function roomHashtag(anime: Anime, dateKey: string) {
	const officialHashtag = anime.official_hashtag?.map(normalizeHashtag).find((tag) => tag.length > 0);
	return officialHashtag ?? fallbackRoomHashtag(anime.id, dateKey);
}

function scheduledAtIso(dateKey: string, time: string | null) {
	const match = time?.match(/^(\d{1,2}):([0-5]\d)/);
	if (!match) return `${dateKey}T00:00:00+09:00`;

	const dateParts = dateKey.split("-").map(Number);
	const [year, month, day] = dateParts;
	if (year == null || month == null || day == null) return `${dateKey}T00:00:00+09:00`;

	const hour = Number(match[1]);
	const minute = Number(match[2]);
	return new Date(Date.UTC(year, month - 1, day, hour - 9, minute)).toISOString();
}

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const anime = await getAnime(supabase, params.id, user?.id ?? null);
	if (!anime) throw error(404, "アニメが見つかりません");
	if (!animeIsScheduledForDate(anime, params.date)) throw error(404, "放送ルームが見つかりません");

	const hashtag = roomHashtag(anime, params.date);
	const [posts, trending] = await Promise.all([
		getEventPosts(supabase, hashtag, user?.id ?? null),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
	]);

	return {
		anime,
		room: {
			date: params.date,
			hashtag,
			scheduled_at: scheduledAtIso(params.date, anime.broadcast_time),
			title: `${anime.title} 放送ルーム`,
		},
		posts,
		trending: trending.data ?? [],
		user,
	};
};

export const actions: Actions = {
	createPost: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const anime = await getAnime(supabase, params.id, user.id);
		if (!anime || !animeIsScheduledForDate(anime, params.date)) {
			return fail(404, { message: "放送ルームが見つかりません" });
		}

		const form = await request.formData();
		const content = (form.get("content") as string | null)?.trim() ?? "";
		const hashtag = roomHashtag(anime, params.date);
		const hasTag = content.toLowerCase().includes(`#${hashtag.toLowerCase()}`);
		const finalContent = hasTag ? content : `${content} #${hashtag}`;

		return insertPostWithHashtags(supabase, user.id, finalContent, null, [], anime.id);
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
