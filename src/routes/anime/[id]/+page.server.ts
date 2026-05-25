import { error, fail } from "@sveltejs/kit";
import { ADMIN_EMAIL } from "$env/static/private";
import { recommendAnimeAction, removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import { getAnime, getAnimeRelations, getUsersWhoListedAnime } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

function toDateStr(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function isEligibleForRoomLog(season: string | null): boolean {
	if (!season) return false;
	const parts = season.split("-");
	const y = parseInt(parts[0] ?? "", 10);
	const name = parts[1];
	if (y > 2026) return true;
	return y === 2026 && name !== "winter";
}

function calcBroadcastEpisodes(
	airedFrom: string,
	airedTo: string | null,
	broadcastDay: number,
): Array<{ number: number; date: string }> {
	const start = new Date(airedFrom);
	const today = new Date();
	const end = airedTo ? new Date(airedTo) : today;
	const cutoff = end < today ? end : today;

	const first = new Date(start);
	while (first.getDay() !== broadcastDay) {
		first.setDate(first.getDate() + 1);
	}

	const dates: string[] = [];
	const cur = new Date(first);
	while (cur <= cutoff) {
		dates.push(toDateStr(cur));
		cur.setDate(cur.getDate() + 7);
	}

	return dates.reverse().map((date, i) => ({ number: dates.length - i, date }));
}

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const anime = await getAnime(supabase, params.id, user?.id ?? null);

	if (!anime) throw error(404, "アニメが見つかりません");

	const [listedUsers, relations] = await Promise.all([
		getUsersWhoListedAnime(supabase, params.id),
		getAnimeRelations(supabase, anime.mal_id),
	]);

	const episodes =
		isEligibleForRoomLog(anime.season) && anime.broadcast_day != null && anime.aired_from != null
			? calcBroadcastEpisodes(anime.aired_from, anime.aired_to ?? null, anime.broadcast_day)
			: [];

	return { anime, user, isAdmin: user?.email === ADMIN_EMAIL, listedUsers, relations, episodes };
};

export const actions: Actions = {
	upsertWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return upsertUserAnimeEntry(supabase, request, user.id);
	},

	removeWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return removeUserAnimeEntry(supabase, request, user.id);
	},

	recommendAnime: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { recommendMessage: "ログインが必要です" });
		return recommendAnimeAction(supabase, request, user.id);
	},
};
