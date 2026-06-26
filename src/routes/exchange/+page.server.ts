import { fail, redirect } from "@sveltejs/kit";
import {
	MAX_EXCHANGE_SUBJECTIVE_TAGS,
	toExchangeSubjectiveTags,
	validateExchangeSubjectiveTags,
} from "$lib/exchange-tags";
import { getExchangeEntries } from "$lib/server/exchange";
import { getAnimeRankingTrending } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) throw redirect(302, "/");

	const [exchanges, waitingExchanges, trendingResult, animeTrending] = await Promise.all([
		getExchangeEntries(supabase, user.id),
		getExchangeEntries(supabase, user.id, 1, "waiting"),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);
	const waitingExchange = exchanges.find((entry) => entry.status === "waiting") ?? waitingExchanges[0] ?? null;

	return {
		user,
		exchanges,
		waitingExchange,
		latestMatchedExchange: exchanges.find((entry) => entry.status === "matched" && entry.received_anime) ?? null,
		trending: trendingResult.data ?? [],
		animeTrending,
	};
};

export const actions: Actions = {
	exchangeAnime: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { exchangeMessage: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		const comment = ((form.get("comment") as string | null)?.trim() ?? "") || null;
		const subjectiveTags = toExchangeSubjectiveTags(form.getAll("subjective_tags"));
		if (!animeId || Number.isNaN(Number(animeId))) {
			return fail(400, { exchangeMessage: "アニメを選択してください" });
		}

		if (comment && comment.length > 120) {
			return fail(400, { exchangeMessage: "コメントは120文字以内で入力してください" });
		}
		if (subjectiveTags.length > MAX_EXCHANGE_SUBJECTIVE_TAGS) {
			return fail(400, { exchangeMessage: "タグは3個まで選択できます" });
		}
		if (!validateExchangeSubjectiveTags(subjectiveTags)) {
			return fail(400, { exchangeMessage: "タグの指定が不正です" });
		}

		const { data, error } = await supabase.rpc("create_anime_exchange", {
			p_anime_id: Number(animeId),
			p_comment: comment,
			p_subjective_tags: subjectiveTags,
		});
		if (error) {
			if (String(error.message).includes("anime not found")) {
				return fail(404, { exchangeMessage: "アニメが見つかりません" });
			}
			if (String(error.message).includes("you already have a waiting exchange")) {
				return fail(409, {
					exchangeMessage: "待機中のトレードがあります。マッチングをやめてからもう一度お試しください。",
				});
			}
			console.error("anime exchange error:", error);
			return fail(500, { exchangeMessage: "トレードに失敗しました" });
		}

		const result = data?.[0] ?? null;
		let receivedAnime: { id: string; title: string; cover_url: string | null } | null = null;

		if (result?.received_anime_id != null) {
			const { data: animeRow } = await supabase
				.from("anime")
				.select("id, title, cover_url")
				.eq("id", result.received_anime_id)
				.maybeSingle();

			if (animeRow) {
				receivedAnime = {
					id: String(animeRow.id),
					title: animeRow.title,
					cover_url: animeRow.cover_url,
				};
			}
		}

		return {
			exchangeSuccess: true,
			exchangeMatched: result?.received_anime_id != null,
			receivedAnime,
		};
	},

	cancelExchange: async ({ locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { cancelMessage: "ログインが必要です" });

		const { data, error } = await supabase.rpc("cancel_anime_exchange");
		if (error) {
			console.error("anime exchange cancel error:", error);
			return fail(500, { cancelMessage: "マッチングのキャンセルに失敗しました" });
		}

		const result = data?.[0] ?? null;
		if (!result?.cancelled) {
			return fail(409, { cancelMessage: "待機中のトレードが見つかりません" });
		}

		return { cancelSuccess: true };
	},
};
