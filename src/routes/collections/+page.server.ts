import { fail, redirect } from "@sveltejs/kit";
import { MAX_COLLECTIONS_PER_USER, parseCollectionInput } from "$lib/collections";
import { ensureAccountCanWrite } from "$lib/server/actions";
import { getUserCollections } from "$lib/server/queries";
import { redirectToLogin } from "$lib/server/require-login";
import type { Actions, PageServerLoad } from "./$types";

/**
 * 自分のコレクションの一覧（#515）。YouTube の再生リストのように、管理するのは自分用のこの画面で、
 * 人に見せるときは公開にしてリンクを渡す（プロフィールには並べない）
 */
export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	// 読めなかったときは null にして、「まだ無い」と見せない
	const collections = await getUserCollections(supabase, user.id).catch((): null => null);
	return { collections };
};

export const actions: Actions = {
	create: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		const moderationFailure = await ensureAccountCanWrite(supabase, user.id);
		if (moderationFailure) return moderationFailure;

		const parsed = parseCollectionInput(await request.formData());
		if (!parsed.ok) return fail(400, { field: parsed.field, message: parsed.message });

		const { data, error: insertError } = await supabase
			.from("user_collections")
			.insert({
				user_id: user.id,
				title: parsed.value.title,
				description: parsed.value.description,
				is_public: parsed.value.isPublic,
				kind: parsed.value.kind,
				...(parsed.value.tiers ? { tiers: parsed.value.tiers } : {}),
			})
			.select("id")
			.single();
		if (insertError || !data) {
			// 上限（179 のトリガー）
			if (insertError?.code === "22023") {
				return fail(400, { message: `コレクションは${MAX_COLLECTIONS_PER_USER}個まで作れます` });
			}
			console.error("collection create error:", insertError);
			return fail(500, { message: "コレクションの作成に失敗しました" });
		}
		redirect(303, `/collections/${data.id}`);
	},
};
