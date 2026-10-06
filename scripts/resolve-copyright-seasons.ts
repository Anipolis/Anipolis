import { createClient } from "@supabase/supabase-js";
import { looseCopyrightKey } from "../src/lib/annict.ts";
import { pickCopyrightForSeason, titleSeasonNumber } from "../src/lib/copyright-season.ts";

// ©確認キュー（anime_copyright_reviews）のうち、候補が「期の違いだけ」のものを、作品の期に
// 合う表記で自動的に決める（例: 「虚構推理 Season2」→「…／虚構推理2製作委員会」）。
// 期はタイトルの明示（第二期 / Season2 / Ⅱ / 続 / 末尾の数字）を優先し、無ければ MAL の
// 前作をたどった何作目かを使う。関連データが途切れている作品は判断せず人の確認に残す。
//
//   pnpm resolve:copyright-seasons [-- --dry-run]
//
// import:annict / collect:copyright の後に流す想定（LOCAL ONLY）。

const PAGE_SIZE = 1000;
const REVIEW_KINDS = ["annict_mismatch", "collector_multiple", "annict_ambiguous"];

type RelationRow = { anime_mal_id: number; related_anime_mal_id: number; relation_type: string };
type ReviewRow = {
	anime_id: number;
	candidates: { text: string }[];
	anime: { title: string; mal_id: number | null; copyright: string | null } | null;
};

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
		);
	}
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchAll<T>(
	query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await query(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(error.message);
		rows.push(...((data ?? []) as T[]));
		if (!data || data.length < PAGE_SIZE) break;
	}
	return rows;
}

/**
 * 前作（種類を問わず）をすべてたどり、同じ種類（TV 等）の作品数 + 1 = 何作目かを返す
 * 関数を作る。劇場版を挟む続編も数える。関連データの無い作品・前作があれば null —
 * その先の前作が欠けているかもしれない（ツルネ2期の前作が特別編で途切れている等）。
 */
function createPrequelOrdinal(relations: RelationRow[], typeByMalId: Map<number, string | null>) {
	const hasRelations = new Set(relations.map((relation) => relation.anime_mal_id));
	const prequels = new Map<number, number[]>();
	for (const relation of relations) {
		if (relation.relation_type !== "Prequel") continue;
		prequels.set(relation.anime_mal_id, [
			...(prequels.get(relation.anime_mal_id) ?? []),
			relation.related_anime_mal_id,
		]);
	}
	return (malId: number): number | null => {
		if (!hasRelations.has(malId)) return null;
		const type = typeByMalId.get(malId);
		const seen = new Set([malId]);
		const queue = [...(prequels.get(malId) ?? [])];
		let sameType = 0;
		while (queue.length > 0) {
			const prequel = queue.shift() as number;
			if (seen.has(prequel)) continue;
			seen.add(prequel);
			if (!typeByMalId.has(prequel) || !hasRelations.has(prequel)) return null;
			if (typeByMalId.get(prequel) === type) sameType += 1;
			queue.push(...(prequels.get(prequel) ?? []));
		}
		return sameType + 1;
	};
}

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const supabase = getSupabaseClient();

	const relations = await fetchAll<RelationRow>((from, to) =>
		supabase
			.from("anime_relations")
			.select("anime_mal_id,related_anime_mal_id,relation_type")
			.order("anime_mal_id")
			.range(from, to),
	);
	const animeTypes = await fetchAll<{ mal_id: number; type: string | null }>((from, to) =>
		supabase.from("anime").select("mal_id,type").not("mal_id", "is", null).order("id").range(from, to),
	);
	const prequelOrdinal = createPrequelOrdinal(
		relations,
		new Map(animeTypes.map((anime) => [anime.mal_id, anime.type])),
	);
	const reviews = await fetchAll<ReviewRow>((from, to) =>
		supabase
			.from("anime_copyright_reviews")
			.select("anime_id,candidates,anime:anime!anime_copyright_reviews_anime_id_fkey(title,mal_id,copyright)")
			.eq("status", "pending")
			.in("kind", REVIEW_KINDS)
			.order("id")
			.range(from, to),
	);

	let kept = 0;
	let replaced = 0;
	const decidedAnimeIds = new Set<number>();
	for (const review of reviews) {
		if (!review.anime || decidedAnimeIds.has(review.anime_id)) continue;
		const current = review.anime.copyright;
		const season =
			titleSeasonNumber(review.anime.title) ??
			(review.anime.mal_id !== null ? prequelOrdinal(review.anime.mal_id) : null);
		if (season === null) continue;
		const texts = [...(current ? [current] : []), ...review.candidates.map((candidate) => candidate.text)];
		const pick = pickCopyrightForSeason(season, texts);
		if (!pick) continue;

		const keep = current !== null && looseCopyrightKey(pick) === looseCopyrightKey(current);
		console.log(
			`${keep ? "keep   " : "replace"} [${season}期] ${review.anime.title} | ${current ?? "(空)"}${keep ? "" : ` → ${pick}`}`,
		);
		decidedAnimeIds.add(review.anime_id);
		if (keep) kept += 1;
		else replaced += 1;
		if (dryRun) continue;

		if (!keep) {
			const { error } = await supabase.from("anime").update({ copyright: pick }).eq("id", review.anime_id);
			if (error) throw new Error(`Could not update anime ${review.anime_id}: ${error.message}`);
		}
		// 1作品の © を決めたら、その作品の確認待ちをまとめて閉じる（管理画面と同じ）
		const { error } = await supabase
			.from("anime_copyright_reviews")
			.update({
				status: "resolved",
				resolution: keep ? "kept" : "replaced",
				resolved_copyright: pick,
				resolved_at: new Date().toISOString(),
			})
			.eq("anime_id", review.anime_id)
			.eq("status", "pending");
		if (error) throw new Error(`Could not close reviews for anime ${review.anime_id}: ${error.message}`);
	}
	console.log(
		`${dryRun ? "[dry-run] " : ""}pending ${reviews.length}: kept ${kept}, replaced ${replaced}, left for review ${reviews.length - kept - replaced}`,
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
