import { fail, redirect } from "@sveltejs/kit";
import { removeAnimeMute, upsertAnimeMute } from "$lib/server/actions";
import { getAnimeMutes } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const mutes = await getAnimeMutes(supabase, user.id);

	// If arriving from schedule page bell → カスタムミュート設定 link with ?anime_id=X,
	// create a virtual entry for that anime if it doesn't already have a mute record.
	const virtualAnimeId = url.searchParams.get("anime_id");
	const stagedAnimeId = virtualAnimeId && !Number.isNaN(Number(virtualAnimeId)) ? virtualAnimeId : null;
	let virtualAnime: { id: string; title: string; cover_url: string | null } | null = null;
	if (stagedAnimeId && !mutes.find((m) => m.anime_id === stagedAnimeId)) {
		const { data } = await supabase
			.from("anime")
			.select("id, title, cover_url")
			.eq("id", Number(stagedAnimeId))
			.maybeSingle();
		if (data) virtualAnime = { id: String(data.id), title: data.title, cover_url: data.cover_url ?? null };
	}

	return { mutes, virtualAnime, stagedAnimeId };
};

export const actions: Actions = {
	updateAnimeMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		const muteType = form.get("mute_type") as string | null;
		if (!animeId || (muteType !== "period" && muteType !== "always")) {
			return fail(400, { message: "入力内容を確認してください" });
		}
		const periodDays = muteType === "period" ? Number(form.get("period_days") ?? 3) : null;
		if (muteType === "period" && (periodDays == null || periodDays < 1 || periodDays > 7)) {
			return fail(400, { message: "ミュート期間を選択してください（1〜7日）" });
		}
		const isRepeat = form.get("is_repeat") === "on";

		const result = await upsertAnimeMute(supabase, user.id, animeId, muteType, periodDays, isRepeat, null);
		if ("status" in result) return fail(result.status, result.data as Record<string, unknown>);
		return result;
	},

	removeAnimeMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		if (!animeId) return fail(400, { message: "ミュート設定が見つかりません" });

		const result = await removeAnimeMute(supabase, user.id, animeId);
		if ("status" in result) return fail(result.status, result.data as Record<string, unknown>);
		return result;
	},
};
