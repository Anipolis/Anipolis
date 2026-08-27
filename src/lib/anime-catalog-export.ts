import type { SupabaseClient } from "@supabase/supabase-js";
import {
	ANIME_OFFLINE_DBCL_URL,
	ANIME_OFFLINE_LICENSE_URL,
	ANIME_OFFLINE_ODBL_URL,
	ANIME_OFFLINE_REPOSITORY_URL,
	ANIPOLIS_TRANSFORMATION_URL,
} from "./anime-offline-database.ts";

const PAGE_SIZE = 1_000;

/** 事前生成した成果物を置く公開バケットとオブジェクトパス（migration 123 で作成） */
export const ANIME_CATALOG_EXPORT_BUCKET = "public-data";
export const ANIME_CATALOG_EXPORT_OBJECT = "anime-catalog.json";

type SourceRecordRow = {
	mal_id: number;
	source: "anime_offline_database" | "jikan" | "mal" | "wikidata" | "syobocal" | "manual";
	source_version: string;
	source_url: string;
	source_updated_at: string | null;
	normalized_data: Record<string, unknown>;
	imported_at: string;
};

type SourceRecordDatabase = {
	public: {
		Tables: {
			anime_source_records: {
				Row: SourceRecordRow;
				Insert: SourceRecordRow;
				Update: Partial<SourceRecordRow>;
			};
		};
	};
};

/**
 * anime-offline-database 由来レコードだけを集めた ODbL 派生データの公開 JSON を
 * 組み立てる。定期ワークフロー（scripts/export-anime-catalog.ts）が成果物を
 * Storage へ事前生成し、/api/data/anime-catalog はそれを配信する。
 * このリクエスト時生成はワークフロー用と、成果物が未生成の場合のフォールバック。
 */
export async function buildAnimeCatalogExport(supabase: SupabaseClient): Promise<Record<string, unknown>> {
	const rows: Array<Record<string, unknown>> = [];
	const sourceReader = supabase as unknown as SupabaseClient<SourceRecordDatabase>;

	for (let start = 0; ; start += PAGE_SIZE) {
		const { data, error } = await sourceReader
			.from("anime_source_records")
			.select("mal_id,source_version,source_url,source_updated_at,normalized_data,imported_at")
			.eq("source", "anime_offline_database")
			.order("mal_id", { ascending: true })
			.range(start, start + PAGE_SIZE - 1);

		if (error) throw new Error(`anime catalog export query failed: ${error.message}`);

		rows.push(...(data ?? []));
		if (!data || data.length < PAGE_SIZE) break;
	}

	const sourceUrls = [
		...new Set(rows.map((row) => row["source_url"]).filter((url): url is string => typeof url === "string")),
	].sort();
	const sourceVersions = [
		...new Set(
			rows
				.map((row) => row["source_version"])
				.filter((version): version is string => typeof version === "string"),
		),
	].sort();
	const data = rows.map((row) => row["normalized_data"]);

	return {
		name: "Anipolis ODbL derivative of anime-offline-database",
		scope: "anime-offline-database derived records only",
		is_complete_anipolis_catalog: false,
		excluded_sources: ["wikidata", "jikan", "mal", "syobocal", "manual"],
		exclusion_reason: "Third-party and manually curated data are kept outside this ODbL derivative.",
		generated_at: new Date().toISOString(),
		license: {
			name: "Open Database License 1.0 and Database Contents License 1.0",
			odbl: ANIME_OFFLINE_ODBL_URL,
			dbcl: ANIME_OFFLINE_DBCL_URL,
			upstream_license: ANIME_OFFLINE_LICENSE_URL,
		},
		source: {
			repository: ANIME_OFFLINE_REPOSITORY_URL,
			versions: sourceVersions,
			release_assets: sourceUrls,
		},
		transformation: ANIPOLIS_TRANSFORMATION_URL,
		count: data.length,
		data,
	};
}
