import { animeOgPublicUrl } from "$lib/anime-og";
import { getAnimeOgSource } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

// 作品の共有用カード（#271）。作品ページの og:image はここを指す。
// 手元で作ったカード（scripts/generate-anime-og-cards.ts）があればそれを、無ければ既定の画像を返す。
// クローラーはリダイレクト先を読まないことがあるので、転送ではなく中身をそのまま返す。
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

export const GET: RequestHandler = async ({ params, fetch, locals: { supabase } }) => {
	const animeId = Number(params.id);
	const anime = Number.isInteger(animeId) && animeId > 0 ? await getAnimeOgSource(supabase, animeId) : null;
	const cardUrl = anime ? animeOgPublicUrl(anime) : null;
	if (cardUrl) {
		const card = await fetch(cardUrl).catch(() => null);
		if (card?.ok && card.body) {
			return new Response(card.body, {
				headers: { "content-type": "image/jpeg", "cache-control": CACHE_CONTROL },
			});
		}
	}
	const fallback = await fetch("/og-default.png");
	return new Response(fallback.body, {
		status: fallback.ok ? 200 : 404,
		// 既定の画像は、カードができたら差し替わるよう短めにキャッシュする
		headers: { "content-type": "image/png", "cache-control": "public, max-age=600" },
	});
};
