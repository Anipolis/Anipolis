import { fail, redirect } from "@sveltejs/kit";
import { removeAnimeMute, upsertAnimeMute } from "$lib/server/actions";
import { getAnimeMutes } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

/** 文字列を正の整数に正規化する。整数でない・0以下・桁あふれは null を返す。 */
function parsePositiveInt(value: string | null): number | null {
	if (value == null) return null;
	const trimmed = value.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const n = Number(trimmed);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const [{ data: mutedWords }, mutes] = await Promise.all([
		supabase
			.from("muted_words")
			.select("id, word, created_at")
			.eq("user_id", user.id)
			.order("created_at", { ascending: false }),
		getAnimeMutes(supabase, user.id),
	]);

	const parsedAnimeId = parsePositiveInt(url.searchParams.get("anime_id"));
	const stagedAnimeId = parsedAnimeId !== null ? String(parsedAnimeId) : null;
	let virtualAnime: { id: string; title: string; cover_url: string | null } | null = null;
	if (stagedAnimeId && !mutes.find((m) => m.anime_id === stagedAnimeId)) {
		const { data } = await supabase
			.from("anime")
			.select("id, title, cover_url")
			.eq("id", Number(stagedAnimeId))
			.maybeSingle();
		if (data) virtualAnime = { id: String(data.id), title: data.title, cover_url: data.cover_url ?? null };
	}

	return { mutedWords: mutedWords ?? [], mutes, virtualAnime, stagedAnimeId };
};

export const actions: Actions = {
	addMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const word = (form.get("word") as string | null)?.trim().toLocaleLowerCase() ?? "";

		if (!word) return fail(400, { field: "word", message: "ミュートするワードを入力してください" });
		if (word.length > 80)
			return fail(400, { field: "word", message: "ミュートワードは80文字以内で入力してください" });

		const { error } = await supabase.from("muted_words").insert({ user_id: user.id, word });

		if (error) {
			if (error.code === "23505") {
				return fail(400, { field: "word", message: "このワードはすでにミュートされています" });
			}
			return fail(500, { message: "ミュートワードの追加に失敗しました" });
		}

		return { muteSuccess: true };
	},

	removeMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const id = (form.get("id") as string | null)?.trim() ?? "";
		if (!id) return fail(400, { message: "削除するミュートワードが見つかりません" });

		const { error } = await supabase.from("muted_words").delete().eq("id", id).eq("user_id", user.id);

		if (error) return fail(500, { message: "ミュートワードの削除に失敗しました" });

		return { muteSuccess: true };
	},

	updateAnimeMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		const muteType = form.get("mute_type") as string | null;
		if (!animeId || (muteType !== "period" && muteType !== "always")) {
			return fail(400, { message: "入力内容を確認してください" });
		}
		const periodDays =
			muteType === "period" ? parsePositiveInt((form.get("period_days") as string | null) ?? "3") : null;
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
