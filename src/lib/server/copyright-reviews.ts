import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@sveltejs/kit";
import { COPYRIGHT_REVIEW_KINDS, type CopyrightReviewKind, isCopyrightReviewKind } from "$lib/copyright-reviews";
import type { Database } from "$lib/supabase/database.types";

// 権利表記（©）の人力確認キュー（anime_copyright_reviews, migration 137）。
// 取り込みスクリプトが積んだ作品を、管理画面の「©確認」で決める。

export const COPYRIGHT_REVIEW_PAGE_SIZE = 30;
const MAX_COPYRIGHT_LENGTH = 300;

export type CopyrightReviewCandidate = { text: string; source: "official_site" | "annict" };

export type CopyrightReviewItem = {
	id: number;
	kind: CopyrightReviewKind;
	candidates: CopyrightReviewCandidate[];
	note: string | null;
	anime: {
		id: number;
		title: string;
		season: string | null;
		copyright: string | null;
		cover_source_url: string | null;
		official_site_url: string | null;
	};
};

function parseCandidates(value: unknown): CopyrightReviewCandidate[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const text = (entry as Record<string, unknown>)["text"];
		const source = (entry as Record<string, unknown>)["source"];
		if (typeof text !== "string" || !text.trim()) return [];
		return [{ text: text.trim(), source: source === "official_site" ? "official_site" : "annict" }];
	});
}

export async function countPendingCopyrightReviews(
	supabase: SupabaseClient<Database>,
): Promise<Record<CopyrightReviewKind, number>> {
	const entries = await Promise.all(
		COPYRIGHT_REVIEW_KINDS.map(async (kind) => {
			const { count, error } = await supabase
				.from("anime_copyright_reviews")
				.select("id", { count: "exact", head: true })
				.eq("status", "pending")
				.eq("kind", kind);
			if (error) console.error("copyright review count failed:", error.message);
			return [kind, count ?? 0] as const;
		}),
	);
	return Object.fromEntries(entries) as Record<CopyrightReviewKind, number>;
}

export async function getPendingCopyrightReviews(
	supabase: SupabaseClient<Database>,
	kind: CopyrightReviewKind,
	page: number,
): Promise<CopyrightReviewItem[]> {
	const from = (page - 1) * COPYRIGHT_REVIEW_PAGE_SIZE;
	const { data, error } = await supabase
		.from("anime_copyright_reviews")
		.select(
			"id, kind, candidates, note, anime:anime!anime_copyright_reviews_anime_id_fkey ( id, title, season, copyright, cover_source_url, official_site_url )",
		)
		.eq("status", "pending")
		.eq("kind", kind)
		.order("id", { ascending: true })
		.range(from, from + COPYRIGHT_REVIEW_PAGE_SIZE - 1);
	if (error) {
		console.error("copyright review query failed:", error.message);
		return [];
	}
	return (data ?? []).flatMap((row) => {
		if (!row.anime || !isCopyrightReviewKind(row.kind)) return [];
		return [
			{
				id: row.id,
				kind: row.kind,
				candidates: parseCandidates(row.candidates),
				note: row.note,
				anime: row.anime,
			},
		];
	});
}

async function markAnimeReviewsResolved(
	supabase: SupabaseClient<Database>,
	animeId: number,
	userId: string,
	resolution: "kept" | "replaced" | "cleared",
	resolvedCopyright: string | null,
) {
	// 1作品の © を決めたら、その作品の確認待ち（別の種類も含む）をまとめて閉じる
	return supabase
		.from("anime_copyright_reviews")
		.update({
			status: "resolved",
			resolution,
			resolved_copyright: resolvedCopyright,
			resolved_by: userId,
			resolved_at: new Date().toISOString(),
		})
		.eq("anime_id", animeId)
		.eq("status", "pending");
}

/**
 * choice: "keep"（現在の © のまま） / "clear"（© なしに確定） / "custom"（手入力） /
 * "candidate:<index>"（候補を採用）
 */
export async function resolveCopyrightReviewAction(
	request: Request,
	supabase: SupabaseClient<Database>,
	userId: string,
) {
	const fd = await request.formData();
	const reviewId = Number(fd.get("review_id"));
	const choice = String(fd.get("choice") ?? "");
	if (!Number.isInteger(reviewId) || reviewId <= 0) return fail(400, { message: "確認項目が不正です" });

	const { data: review, error: reviewError } = await supabase
		.from("anime_copyright_reviews")
		.select("id, anime_id, candidates, status, anime:anime!anime_copyright_reviews_anime_id_fkey ( copyright )")
		.eq("id", reviewId)
		.maybeSingle();
	if (reviewError) return fail(500, { message: `確認項目の取得に失敗しました: ${reviewError.message}` });
	if (!review || review.status !== "pending") return fail(409, { message: "この項目は既に処理されています" });

	const current = review.anime?.copyright ?? null;
	let next: string | null;
	if (choice === "keep") {
		if (current === null) return fail(400, { message: "現在の © が無いため「このまま」は選べません" });
		next = current;
	} else if (choice === "clear") {
		next = null;
	} else if (choice === "custom") {
		next = String(fd.get("custom_text") ?? "").trim();
		if (!next) return fail(400, { message: "© を入力してください" });
		if (next.length > MAX_COPYRIGHT_LENGTH)
			return fail(400, { message: `© は${MAX_COPYRIGHT_LENGTH}文字以内です` });
	} else if (choice.startsWith("candidate:")) {
		const candidate = parseCandidates(review.candidates)[Number(choice.slice("candidate:".length))];
		if (!candidate) return fail(400, { message: "候補が見つかりません" });
		next = candidate.text;
	} else {
		return fail(400, { message: "採用する © を選んでください" });
	}

	if (next !== current) {
		const { error } = await supabase.from("anime").update({ copyright: next }).eq("id", review.anime_id);
		if (error) return fail(500, { message: `© の更新に失敗しました: ${error.message}` });
	}
	const resolution = next === null ? "cleared" : next === current ? "kept" : "replaced";
	const { error } = await markAnimeReviewsResolved(supabase, review.anime_id, userId, resolution, next);
	if (error) return fail(500, { message: `確認状態の更新に失敗しました: ${error.message}` });
	return { success: true };
}

/** 表示中の項目を、現在の © のまま一括で承認する（現在の © がある項目のみ） */
export async function approveCopyrightReviewsAsIsAction(
	request: Request,
	supabase: SupabaseClient<Database>,
	userId: string,
) {
	const fd = await request.formData();
	const ids = fd
		.getAll("review_id")
		.map((value) => Number(value))
		.filter((value) => Number.isInteger(value) && value > 0);
	if (ids.length === 0) return fail(400, { message: "承認する項目がありません" });

	const { data, error } = await supabase
		.from("anime_copyright_reviews")
		.select("id, anime_id, anime:anime!anime_copyright_reviews_anime_id_fkey ( copyright )")
		.in("id", ids)
		.eq("status", "pending");
	if (error) return fail(500, { message: `確認項目の取得に失敗しました: ${error.message}` });

	let approved = 0;
	for (const row of data ?? []) {
		const current = row.anime?.copyright ?? null;
		if (current === null) continue;
		const result = await markAnimeReviewsResolved(supabase, row.anime_id, userId, "kept", current);
		if (result.error) return fail(500, { message: `確認状態の更新に失敗しました: ${result.error.message}` });
		approved += 1;
	}
	return { success: true, approved };
}
