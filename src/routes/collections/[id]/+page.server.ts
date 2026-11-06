import { error, fail, redirect } from "@sveltejs/kit";
import { isCollectionId, parseCollectionInput } from "$lib/collections";
import { ensureAccountCanWrite } from "$lib/server/actions";
import { getAnimeRankingTrending, getCollection, getMyListStatuses, getTrendingHashtags } from "$lib/server/queries";
import type { AnimeStatus } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	// 見えないもの（非公開・鍵・ブロック）も、無いものと同じ「見つからない」にする
	if (!isCollectionId(params.id)) error(404, "コレクションが見つかりません");
	const [{ user }, collection] = await Promise.all([safeGetSession(), getCollection(supabase, params.id)]);
	if (!collection) error(404, "コレクションが見つかりません");

	const [myStatuses, trending, animeTrending] = await Promise.all([
		user
			? getMyListStatuses(
					supabase,
					user.id,
					collection.items.map((anime) => anime.id),
				)
			: Promise.resolve<Record<string, AnimeStatus>>({}),
		getTrendingHashtags(supabase, 10),
		getAnimeRankingTrending(supabase, 5),
	]);

	return { collection, isOwn: user?.id === collection.owner.id, myStatuses, trending, animeTrending, user };
};

export const actions: Actions = {
	updateCollection: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		const moderationFailure = await ensureAccountCanWrite(supabase, user.id);
		if (moderationFailure) return moderationFailure;

		const parsed = parseCollectionInput(await request.formData());
		if (!parsed.ok) return fail(400, { field: parsed.field, message: parsed.message });

		const { data, error: updateError } = await supabase
			.from("user_collections")
			.update({
				title: parsed.value.title,
				description: parsed.value.description,
				is_public: parsed.value.isPublic,
				kind: parsed.value.kind,
				updated_at: new Date().toISOString(),
			})
			.eq("id", params.id)
			.eq("user_id", user.id)
			.select("id")
			.maybeSingle();
		if (updateError) {
			console.error("collection update error:", updateError);
			return fail(500, { message: "コレクションの保存に失敗しました" });
		}
		if (!data) return fail(404, { message: "コレクションが見つかりません" });

		// 段は、作品の段の付け替えと一緒に DB の関数で変える（途中の段を消しても作品がずれないように。192）
		if (parsed.value.tiers && parsed.value.tierOrigins) {
			const { error: tiersError } = await supabase.rpc("set_collection_tiers", {
				p_collection_id: params.id,
				p_tiers: parsed.value.tiers,
				p_origins: parsed.value.tierOrigins,
			});
			if (tiersError) {
				console.error("set_collection_tiers error:", tiersError);
				return fail(500, { field: "tiers", message: "段の保存に失敗しました" });
			}
		}
		return { updated: true };
	},

	deleteCollection: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const { data, error: deleteError } = await supabase
			.from("user_collections")
			.delete()
			.eq("id", params.id)
			.eq("user_id", user.id)
			.select("id")
			.maybeSingle();
		if (deleteError) {
			console.error("collection delete error:", deleteError);
			return fail(500, { message: "コレクションの削除に失敗しました" });
		}
		if (!data) return fail(404, { message: "コレクションが見つかりません" });

		redirect(303, "/collections");
	},
};
