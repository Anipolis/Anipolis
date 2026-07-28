import type { SupabaseClient } from "@supabase/supabase-js";
import { json } from "@sveltejs/kit";
import {
	ANIME_OFFLINE_DBCL_URL,
	ANIME_OFFLINE_LICENSE_URL,
	ANIME_OFFLINE_ODBL_URL,
	ANIME_OFFLINE_REPOSITORY_URL,
	ANIPOLIS_TRANSFORMATION_URL,
} from "$lib/anime-offline-database";
import type { RequestHandler } from "./$types";

const PAGE_SIZE = 1_000;

type SourceRecordRow = {
	mal_id: number;
	source: "anime_offline_database" | "jikan" | "wikidata" | "syobocal" | "manual";
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

export const GET: RequestHandler = async ({ locals: { supabase } }) => {
	const rows: Array<Record<string, unknown>> = [];
	const sourceReader = supabase as unknown as SupabaseClient<SourceRecordDatabase>;

	for (let start = 0; ; start += PAGE_SIZE) {
		const { data, error } = await sourceReader
			.from("anime_source_records")
			.select("mal_id,source_version,source_url,source_updated_at,normalized_data,imported_at")
			.eq("source", "anime_offline_database")
			.order("mal_id", { ascending: true })
			.range(start, start + PAGE_SIZE - 1);

		if (error) {
			return json({ error: "anime catalog could not be generated" }, { status: 500 });
		}

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

	return json(
		{
			name: "Anipolis ODbL derivative of anime-offline-database",
			scope: "anime-offline-database derived records only",
			is_complete_anipolis_catalog: false,
			excluded_sources: ["wikidata", "jikan", "syobocal", "manual"],
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
		},
		{
			headers: {
				"Cache-Control": "public, max-age=3600, s-maxage=86400",
			},
		},
	);
};
