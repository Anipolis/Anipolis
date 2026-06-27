import type { SupabaseClient } from "@supabase/supabase-js";
import { toValidExchangeSubjectiveTags } from "$lib/exchange-tags";
import type { Database } from "$lib/supabase/database.types";
import type { UserAnimeEntry } from "$lib/types";

export interface ExchangeItem {
	id: string;
	status: "waiting" | "matched" | "cancelled";
	created_at: string;
	matched_at: string | null;
	comment: string | null;
	subjective_tags: string[];
	received_entry_id: string | null;
	offered_anime: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
		episode_count: string | null;
		user_entry: UserAnimeEntry | null;
	};
	received_anime: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
		episode_count: string | null;
		user_entry: UserAnimeEntry | null;
	} | null;
	received_comment: string | null;
	received_subjective_tags: string[];
}

type ExchangeRow = {
	id?: unknown;
	status?: unknown;
	created_at?: unknown;
	matched_at?: unknown;
	comment?: unknown;
	subjective_tags?: unknown;
	received_entry_id?: unknown;
	anime?: unknown;
};

type ExchangeAnimeRow = {
	id?: unknown;
	title?: unknown;
	title_en?: unknown;
	cover_url?: unknown;
	episode_count?: unknown;
};

type UserAnimeListRow = {
	anime_id?: unknown;
	status?: unknown;
	score?: unknown;
	progress?: unknown;
	updated_at?: unknown;
};

function toExchangeAnime(value: unknown): ExchangeItem["offered_anime"] | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as ExchangeAnimeRow;
	if (raw.id == null || typeof raw.title !== "string") return null;
	return {
		id: String(raw.id),
		title: raw.title,
		title_en: typeof raw.title_en === "string" ? raw.title_en : null,
		cover_url: typeof raw.cover_url === "string" ? raw.cover_url : null,
		episode_count:
			typeof raw.episode_count === "string" || typeof raw.episode_count === "number"
				? String(raw.episode_count)
				: null,
		user_entry: null,
	};
}

function toUserAnimeEntry(row: UserAnimeListRow): UserAnimeEntry | null {
	if (
		row.status !== "watching" &&
		row.status !== "completed" &&
		row.status !== "plan_to_watch" &&
		row.status !== "dropped" &&
		row.status !== "on_hold"
	) {
		return null;
	}

	return {
		status: row.status,
		score: typeof row.score === "number" ? row.score : null,
		progress: typeof row.progress === "number" ? row.progress : 0,
		updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
	};
}

function toExchangeItem(raw: ExchangeRow): ExchangeItem | null {
	const offeredValue = Array.isArray(raw.anime) ? raw.anime[0] : raw.anime;
	const offered = toExchangeAnime(offeredValue);
	if (!offered) return null;

	const status =
		raw.status === "waiting" || raw.status === "matched" || raw.status === "cancelled" ? raw.status : "waiting";

	return {
		id: String(raw.id),
		status,
		created_at: String(raw.created_at),
		matched_at: typeof raw.matched_at === "string" ? raw.matched_at : null,
		comment: typeof raw.comment === "string" ? raw.comment : null,
		subjective_tags: toValidExchangeSubjectiveTags(Array.isArray(raw.subjective_tags) ? raw.subjective_tags : []),
		received_entry_id: raw.received_entry_id ? String(raw.received_entry_id) : null,
		offered_anime: offered,
		received_anime: null,
		received_comment: null,
		received_subjective_tags: [],
	};
}

export async function getExchangeEntries(
	supabase: SupabaseClient<Database>,
	userId: string,
	limit = 5,
	status?: ExchangeItem["status"],
): Promise<ExchangeItem[]> {
	let query = supabase
		.from("anime_exchange_entries")
		.select(`
			id,
			status,
			created_at,
			matched_at,
			comment,
			subjective_tags,
			received_entry_id,
			anime:anime_exchange_entries_anime_id_fkey (
				id,
				title,
				title_en,
				cover_url,
				episode_count
			)
		`)
		.eq("user_id", userId)
		.order("created_at", { ascending: false });

	if (status) {
		query = query.eq("status", status);
	}

	const { data, error } = await query.limit(limit);

	if (error || !data) return [];
	const entries = (data as unknown as ExchangeRow[])
		.map((row) => toExchangeItem(row))
		.filter((item): item is ExchangeItem => item !== null);

	const receivedEntryIds = [
		...new Set(entries.map((entry) => entry.received_entry_id).filter((id): id is string => Boolean(id))),
	];
	let entriesWithReceived = entries;

	if (receivedEntryIds.length > 0) {
		const { data: receivedRows, error: receivedError } = await supabase
			.from("anime_exchange_entries")
			.select(`
				id,
				comment,
				subjective_tags,
				anime:anime_exchange_entries_anime_id_fkey (
					id,
					title,
					title_en,
					cover_url,
					episode_count
				)
			`)
			.in("id", receivedEntryIds);

		if (receivedError || !receivedRows) return entries;

		const receivedEntryById = new Map<
			string,
			{
				anime: ExchangeItem["offered_anime"];
				comment: string | null;
				subjective_tags: string[];
			}
		>();
		for (const row of receivedRows as unknown as ExchangeRow[]) {
			const animeValue = Array.isArray(row.anime) ? row.anime[0] : row.anime;
			const anime = toExchangeAnime(animeValue);
			if (!anime || !row.id) continue;
			receivedEntryById.set(String(row.id), {
				anime,
				comment: typeof row.comment === "string" ? row.comment : null,
				subjective_tags: toValidExchangeSubjectiveTags(
					Array.isArray(row.subjective_tags) ? row.subjective_tags : [],
				),
			});
		}

		entriesWithReceived = entries.map((entry) => ({
			...entry,
			received_anime: entry.received_entry_id
				? (receivedEntryById.get(entry.received_entry_id)?.anime ?? null)
				: null,
			received_comment: entry.received_entry_id
				? (receivedEntryById.get(entry.received_entry_id)?.comment ?? null)
				: null,
			received_subjective_tags: entry.received_entry_id
				? (receivedEntryById.get(entry.received_entry_id)?.subjective_tags ?? [])
				: [],
		}));
	}

	const animeIds = [
		...new Set(
			entriesWithReceived
				.flatMap((entry) => [entry.offered_anime.id, entry.received_anime?.id])
				.filter((id): id is string => Boolean(id)),
		),
	];
	const numericAnimeIds = animeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
	if (numericAnimeIds.length === 0) return entriesWithReceived;

	const { data: userAnimeRows, error: userAnimeError } = await supabase
		.from("user_anime_list")
		.select("anime_id, status, score, progress, updated_at")
		.eq("user_id", userId)
		.in("anime_id", numericAnimeIds);

	if (userAnimeError || !userAnimeRows) return entriesWithReceived;

	const userEntryByAnimeId = new Map<string, UserAnimeEntry>();
	for (const row of userAnimeRows as unknown as UserAnimeListRow[]) {
		if (row.anime_id == null) continue;
		const entry = toUserAnimeEntry(row);
		if (!entry) continue;
		userEntryByAnimeId.set(String(row.anime_id), entry);
	}

	return entriesWithReceived.map((entry) => ({
		...entry,
		offered_anime: {
			...entry.offered_anime,
			user_entry: userEntryByAnimeId.get(entry.offered_anime.id) ?? null,
		},
		received_anime: entry.received_anime
			? {
					...entry.received_anime,
					user_entry: userEntryByAnimeId.get(entry.received_anime.id) ?? null,
				}
			: null,
	}));
}
