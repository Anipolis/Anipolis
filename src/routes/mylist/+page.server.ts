import { fail, redirect } from "@sveltejs/kit";
import { removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import { getUserAnimeList } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	const { data: profile } = await supabase
		.from("profiles")
		.select("id, username, display_name, avatar_url, list_is_public")
		.eq("id", user.id)
		.single();

	if (!profile) redirect(302, "/");

	const animeList = await getUserAnimeList(supabase, user.id);

	return { animeList, profile, user };
};

export const actions: Actions = {
	upsertWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		// 自動保存は画面の破棄後にも送られるため、送信までにアカウントが切り替わると別の
		// ユーザーのセッションで届く。編集したユーザーと違えば書き込まない
		const expectedUserId = (await request.clone().formData()).get("expected_user_id");
		if (typeof expectedUserId === "string" && expectedUserId !== user.id) {
			return fail(409, { message: "アカウントが切り替わったため保存しませんでした" });
		}
		return upsertUserAnimeEntry(supabase, request, user.id);
	},

	removeWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return removeUserAnimeEntry(supabase, request, user.id);
	},

	toggleVisibility: async ({ locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const { data: current } = await supabase.from("profiles").select("list_is_public").eq("id", user.id).single();

		if (!current) return fail(404, { message: "プロフィールが見つかりません" });

		const { error } = await supabase
			.from("profiles")
			.update({ list_is_public: !current.list_is_public })
			.eq("id", user.id);

		if (error) return fail(500, { message: "更新に失敗しました" });

		return { list_is_public: !current.list_is_public };
	},
};
