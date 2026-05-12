import { getAnimeList } from "$lib/server/queries";
import type { Anime } from "$lib/types";
import type { PageServerLoad } from "./$types";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const all = await getAnimeList(supabase, { status: "airing", limit: 1000, userId: user?.id ?? null });
	const scheduled = all.filter((a): a is Anime & { broadcast_day: number } => a.broadcast_day != null);

	const days: Anime[][] = Array.from({ length: 7 }, () => []);
	for (const anime of scheduled) {
		days[anime.broadcast_day]?.push(anime);
	}
	for (const col of days) {
		col.sort((a, b) => (a.broadcast_time ?? "").localeCompare(b.broadcast_time ?? ""));
	}

	return { days, dayLabels: DAY_LABELS };
};
