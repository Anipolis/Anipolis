import { json } from "@sveltejs/kit";
import {
	ANIME_CATALOG_EXPORT_BUCKET,
	ANIME_CATALOG_EXPORT_OBJECT,
	buildAnimeCatalogExport,
} from "$lib/anime-catalog-export";
import type { RequestHandler } from "./$types";

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

export const GET: RequestHandler = async ({ locals: { supabase }, fetch }) => {
	// 通常経路: syobocal-sync ワークフローが事前生成した成果物をストリーミング配信する。
	// リクエスト時に全レコードをDB走査してメモリ展開しない（カタログ増加への耐性）。
	const { data } = supabase.storage.from(ANIME_CATALOG_EXPORT_BUCKET).getPublicUrl(ANIME_CATALOG_EXPORT_OBJECT);
	try {
		const artifact = await fetch(data.publicUrl);
		if (artifact.ok && artifact.body) {
			return new Response(artifact.body, {
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": CACHE_CONTROL,
				},
			});
		}
	} catch (error) {
		console.error("anime catalog artifact fetch failed:", error);
	}

	// フォールバック: 成果物が未生成（初回デプロイ直後など）の場合のみ動的生成する。
	try {
		const payload = await buildAnimeCatalogExport(supabase);
		return json(payload, { headers: { "Cache-Control": CACHE_CONTROL } });
	} catch (error) {
		console.error("anime catalog dynamic generation failed:", error);
		return json({ error: "anime catalog could not be generated" }, { status: 500 });
	}
};
