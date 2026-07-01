import { fail, redirect } from "@sveltejs/kit";
import { parsePositiveInt, removeAnimeMuteAction, updateAnimeMuteAction } from "$lib/server/actions";
import { getAnimeMuteCandidate, getAnimeMutes, getMutedWordRows } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const [mutedWords, mutes] = await Promise.all([
		getMutedWordRows(supabase, user.id),
		getAnimeMutes(supabase, user.id),
	]);

	const parsedAnimeId = parsePositiveInt(url.searchParams.get("anime_id"));
	const stagedAnimeId = parsedAnimeId !== null ? String(parsedAnimeId) : null;
	let virtualAnime: { id: string; title: string; cover_url: string | null } | null = null;
	if (stagedAnimeId && !mutes.find((m) => m.anime_id === stagedAnimeId)) {
		virtualAnime = await getAnimeMuteCandidate(supabase, Number(stagedAnimeId));
	}

	return { mutedWords, mutes, virtualAnime, stagedAnimeId };
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
		return updateAnimeMuteAction(request, supabase, user.id);
	},

	removeAnimeMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return removeAnimeMuteAction(request, supabase, user.id);
	},
};
