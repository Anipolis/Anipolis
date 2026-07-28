import { json } from "@sveltejs/kit";
import {
	ANIME_OFFLINE_DBCL_URL,
	ANIME_OFFLINE_LICENSE_URL,
	ANIME_OFFLINE_ODBL_URL,
	ANIME_OFFLINE_REPOSITORY_URL,
	ANIME_OFFLINE_SOURCE_NAME,
	ANIPOLIS_TRANSFORMATION_URL,
	findAnimeOfflineSource,
} from "$lib/anime-offline-database";
import type { AnimeResourceLink } from "$lib/types";
import type { RequestHandler } from "./$types";

const PAGE_SIZE = 1_000;

function toResourceLinks(value: unknown): AnimeResourceLink[] {
	if (!Array.isArray(value)) return [];

	return value.flatMap((candidate) => {
		if (!candidate || typeof candidate !== "object") return [];
		const resource = candidate as { name?: unknown; url?: unknown };
		return typeof resource.name === "string" && typeof resource.url === "string"
			? [{ name: resource.name, url: resource.url }]
			: [];
	});
}

export const GET: RequestHandler = async ({ locals: { supabase } }) => {
	const rows: Array<Record<string, unknown>> = [];

	for (let start = 0; ; start += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("anime")
			.select("mal_id,title,title_romaji,episode_count,type,status,season,studio,studio_en,resources")
			.filter("resources", "cs", JSON.stringify([{ name: ANIME_OFFLINE_SOURCE_NAME }]))
			.order("mal_id", { ascending: true })
			.range(start, start + PAGE_SIZE - 1);

		if (error) {
			return json({ error: "anime catalog could not be generated" }, { status: 500 });
		}

		rows.push(...(data ?? []));
		if (!data || data.length < PAGE_SIZE) break;
	}

	const sourceUrls = new Set<string>();
	const data = rows.flatMap((row) => {
		const attribution = findAnimeOfflineSource(toResourceLinks(row["resources"]));
		if (!attribution || typeof row["mal_id"] !== "number") return [];
		sourceUrls.add(attribution.url);

		return [
			{
				mal_id: row["mal_id"],
				title: row["title"],
				title_romaji: row["title_romaji"],
				episode_count: row["episode_count"],
				type: row["type"],
				status: row["status"],
				season: row["season"],
				studio: row["studio"],
				studio_en: row["studio_en"],
				source_url: attribution.url,
			},
		];
	});

	return json(
		{
			name: "Anipolis anime catalog derived from anime-offline-database",
			generated_at: new Date().toISOString(),
			license: {
				name: "Open Database License 1.0 and Database Contents License 1.0",
				odbl: ANIME_OFFLINE_ODBL_URL,
				dbcl: ANIME_OFFLINE_DBCL_URL,
				upstream_license: ANIME_OFFLINE_LICENSE_URL,
			},
			source: {
				repository: ANIME_OFFLINE_REPOSITORY_URL,
				release_assets: [...sourceUrls].sort(),
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
