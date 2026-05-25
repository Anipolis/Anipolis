import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, redirect } from "@sveltejs/kit";
import type { Database } from "$lib/supabase/database.types";
import type { Actions, PageServerLoad } from "./$types";

interface ExchangeItem {
	id: string;
	status: "waiting" | "matched" | "cancelled";
	created_at: string;
	matched_at: string | null;
	received_entry_id: string | null;
	offered_anime: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
	};
	received_anime: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
	} | null;
}

type ExchangeRow = {
	id?: unknown;
	status?: unknown;
	created_at?: unknown;
	matched_at?: unknown;
	received_entry_id?: unknown;
	anime?: unknown;
};

type ExchangeAnimeRow = {
	id?: unknown;
	title?: unknown;
	title_en?: unknown;
	cover_url?: unknown;
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
		received_entry_id: raw.received_entry_id ? String(raw.received_entry_id) : null,
		offered_anime: offered,
		received_anime: null,
	};
}

async function getExchangeEntries(supabase: SupabaseClient<Database>, userId: string): Promise<ExchangeItem[]> {
	const { data, error } = await supabase
		.from("anime_exchange_entries")
		.select(`
			id,
			status,
			created_at,
			matched_at,
			received_entry_id,
			anime:anime_exchange_entries_anime_id_fkey (
				id,
				title,
				title_en,
				cover_url
			)
		`)
		.eq("user_id", userId)
		.order("created_at", { ascending: false })
		.limit(5);

	if (error || !data) return [];
	const entries = (data as unknown as ExchangeRow[])
		.map((row) => toExchangeItem(row))
		.filter((item): item is ExchangeItem => item !== null);

	const receivedEntryIds = [
		...new Set(entries.map((entry) => entry.received_entry_id).filter((id): id is string => Boolean(id))),
	];
	if (receivedEntryIds.length === 0) return entries;

	const { data: receivedRows, error: receivedError } = await supabase
		.from("anime_exchange_entries")
		.select(`
			id,
			anime:anime_exchange_entries_anime_id_fkey (
				id,
				title,
				title_en,
				cover_url
			)
		`)
		.in("id", receivedEntryIds);

	if (receivedError || !receivedRows) return entries;

	const receivedAnimeByEntryId = new Map<
		string,
		{ id: string; title: string; title_en: string | null; cover_url: string | null }
	>();
	for (const row of receivedRows as unknown as ExchangeRow[]) {
		const animeValue = Array.isArray(row.anime) ? row.anime[0] : row.anime;
		const anime = toExchangeAnime(animeValue);
		if (!anime || !row.id) continue;
		receivedAnimeByEntryId.set(String(row.id), anime);
	}

	return entries.map((entry) => ({
		...entry,
		received_anime: entry.received_entry_id ? (receivedAnimeByEntryId.get(entry.received_entry_id) ?? null) : null,
	}));
}

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) throw redirect(302, "/");

	const exchangeDataPromise = (async () => {
		const exchanges = await getExchangeEntries(supabase, user.id);
		return {
			exchanges,
			waitingExchange: exchanges.find((e) => e.status === "waiting") ?? null,
			latestMatchedExchange: exchanges.find((e) => e.status === "matched" && e.received_anime) ?? null,
		};
	})().catch((err) => {
		console.error("[exchange] error:", err);
		return { exchanges: [], waitingExchange: null, latestMatchedExchange: null };
	});

	return { user, exchangeData: exchangeDataPromise };
};

export const actions: Actions = {
	exchangeAnime: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { exchangeMessage: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		if (!animeId || Number.isNaN(Number(animeId))) {
			return fail(400, { exchangeMessage: "アニメを選択してください" });
		}

		const { data, error } = await supabase.rpc("create_anime_exchange", { p_anime_id: Number(animeId) });
		if (error) {
			if (String(error.message).includes("anime not found")) {
				return fail(404, { exchangeMessage: "アニメが見つかりません" });
			}
			console.error("anime exchange error:", error);
			return fail(500, { exchangeMessage: "交換に失敗しました" });
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

	addToMyList: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { listMessage: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		const statusRaw = (form.get("status") as string | null)?.trim() ?? "plan_to_watch";
		const status = ["watching", "completed", "plan_to_watch", "dropped", "on_hold"].includes(statusRaw)
			? (statusRaw as "watching" | "completed" | "plan_to_watch" | "dropped" | "on_hold")
			: "plan_to_watch";
		const progress = Number((form.get("progress") as string | null) ?? "0");

		if (!animeId || Number.isNaN(Number(animeId))) {
			return fail(400, { listMessage: "アニメが見つかりません" });
		}

		const { error } = await supabase
			.from("user_anime_list")
			.upsert(
				{ user_id: user.id, anime_id: Number(animeId), status, progress },
				{ onConflict: "user_id,anime_id" },
			);
		if (error) return fail(500, { listMessage: "マイリスト更新に失敗しました" });
		return { listSuccess: true };
	},
};
