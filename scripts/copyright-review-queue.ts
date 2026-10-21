import type { SupabaseClient } from "@supabase/supabase-js";

// 権利表記（©）の人力確認キュー（anime_copyright_reviews, migration 137）への積み込み。
// 管理画面の「©確認」（/admin/copyright-reviews）で管理者が決める。

export type CopyrightReviewKind = "collector_multiple" | "annict_mismatch" | "annict_shared" | "annict_ambiguous";

export type CopyrightReviewInput = {
	anime_id: number;
	kind: CopyrightReviewKind;
	candidates: { text: string; source: "official_site" | "annict" }[];
	note?: string | null;
};

const BATCH_SIZE = 200;

/**
 * 確認待ちとして積む。同じ作品・種類の行が既にあれば（解決済みを含め）触らない —
 * 管理者の判断を取り込みの再実行で差し戻さないため。
 */
export async function enqueueCopyrightReviews(
	// biome-ignore lint/suspicious/noExplicitAny: generated types may lag behind migration 137
	supabase: SupabaseClient<any>,
	items: readonly CopyrightReviewInput[],
): Promise<void> {
	for (let start = 0; start < items.length; start += BATCH_SIZE) {
		const { error } = await supabase.from("anime_copyright_reviews").upsert(
			items.slice(start, start + BATCH_SIZE).map((item) => ({ ...item, note: item.note ?? null })),
			{ onConflict: "anime_id,kind", ignoreDuplicates: true },
		);
		if (error) throw new Error(`Could not enqueue copyright reviews: ${error.message}`);
	}
}

/** 管理者が「© なし」に確定した作品。取り込みで © を埋め直さない */
export async function fetchCopyrightClearedAnimeIds(
	// biome-ignore lint/suspicious/noExplicitAny: generated types may lag behind migration 137
	supabase: SupabaseClient<any>,
): Promise<Set<number>> {
	const ids = new Set<number>();
	for (let start = 0; ; start += 1000) {
		const { data, error } = await supabase
			.from("anime_copyright_reviews")
			.select("anime_id")
			.eq("resolution", "cleared")
			.order("id", { ascending: true })
			.range(start, start + 999);
		if (error) throw new Error(`Could not read cleared copyright reviews: ${error.message}`);
		for (const row of data ?? []) ids.add(row.anime_id as number);
		if (!data || data.length < 1000) break;
	}
	return ids;
}
