import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@sveltejs/kit";
import type { Database } from "$lib/supabase/database.types";

type AnimeWriteResult = { success: true; animeId: string } | ReturnType<typeof fail<{ message: string }>>;

function normalizeBroadcastTime(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return null;

	const match = raw.match(/^(\d{1,2}):([0-5]\d)$/);
	if (!match) return undefined;

	const hour = Number(match[1]);
	if (!Number.isInteger(hour) || hour < 0 || hour > 47) return undefined;

	return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function normalizeEpisodeCount(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return null;

	const episodeCount = Number(raw);
	if (!Number.isInteger(episodeCount) || episodeCount < 1) return undefined;

	return raw;
}

function normalizeBroadcastDuration(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return 30;

	const minutes = Number(raw);
	if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return undefined;
	return minutes;
}

function toArr(vals: FormDataEntryValue[]) {
	return vals.map((v) => (v as string).trim()).filter(Boolean);
}

function nullableText(fd: FormData, name: string) {
	return (fd.get(name) as string | null)?.trim() || null;
}

function parseBroadcastDay(fd: FormData) {
	const v = (fd.get("broadcast_day") as string | null)?.trim();
	return v !== "" && v != null ? parseInt(v, 10) : null;
}

function parseBroadcastStations(fd: FormData) {
	const v = (fd.get("broadcast_station") as string | null)?.trim();
	if (!v) return null;
	const arr = v
		.split(/[,\u3001]/)
		.map((s) => s.trim())
		.filter(Boolean);
	return arr.length ? arr : null;
}

async function uploadInlineCover(supabase: SupabaseClient<Database>, fd: FormData, fallbackCoverUrl: string | null) {
	let coverUrl = nullableText(fd, "cover_url") ?? fallbackCoverUrl;
	const imageFile = fd.get("image_file");
	if (imageFile instanceof File && imageFile.size > 0) {
		const ext = imageFile.type === "image/webp" ? "webp" : "jpg";
		const path = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
		const arrayBuffer = await imageFile.arrayBuffer();
		const { error: uploadError } = await supabase.storage
			.from("anime-covers")
			.upload(path, arrayBuffer, { contentType: imageFile.type, upsert: false });
		if (!uploadError) {
			coverUrl = supabase.storage.from("anime-covers").getPublicUrl(path).data.publicUrl;
		}
	}
	return coverUrl;
}

async function buildAnimePayload(supabase: SupabaseClient<Database>, fd: FormData, fallbackCoverUrl: string | null) {
	const title = nullableText(fd, "title");
	if (!title) return fail(400, { message: "タイトルは必須です" });

	const episodeCount = normalizeEpisodeCount(fd.get("episode_count") as string | null);
	if (episodeCount === undefined) {
		return fail(400, { message: "話数は1以上の整数で入力してください" });
	}

	const broadcastTime = normalizeBroadcastTime(fd.get("broadcast_time") as string | null);
	if (broadcastTime === undefined) {
		return fail(400, { message: "放送時刻は 23:30 や 26:00 の形式で入力してください" });
	}

	const broadcastDurationMinutes = normalizeBroadcastDuration(fd.get("broadcast_duration_minutes") as string | null);
	if (broadcastDurationMinutes === undefined) {
		return fail(400, { message: "放送枠は1〜1440分の整数で入力してください" });
	}

	return {
		title,
		title_en: nullableText(fd, "title_en"),
		title_romaji: nullableText(fd, "title_romaji"),
		synopsis: nullableText(fd, "synopsis"),
		cover_url: await uploadInlineCover(supabase, fd, fallbackCoverUrl),
		season: nullableText(fd, "season"),
		episode_count: episodeCount,
		type: nullableText(fd, "type"),
		aired_from: nullableText(fd, "aired_from"),
		aired_to: nullableText(fd, "aired_to"),
		source: nullableText(fd, "source"),
		genre: toArr(fd.getAll("genre")),
		studio: toArr(fd.getAll("studio")),
		producer: toArr(fd.getAll("producer")),
		official_hashtag: toArr(fd.getAll("official_hashtag")),
		official_site_url: nullableText(fd, "official_site_url"),
		official_x_url: nullableText(fd, "official_x_url"),
		copyright: nullableText(fd, "copyright"),
		broadcast_day: parseBroadcastDay(fd),
		broadcast_time: broadcastTime,
		broadcast_duration_minutes: broadcastDurationMinutes,
		broadcast_station: parseBroadcastStations(fd),
	};
}

export async function registerAnimeAction(
	supabase: SupabaseClient<Database>,
	request: Request,
): Promise<AnimeWriteResult> {
	const fd = await request.formData();
	const payload = await buildAnimePayload(supabase, fd, null);
	if ("status" in payload) return payload;

	// biome-ignore lint/suspicious/noExplicitAny: shared writer must tolerate generated type lag after migrations
	const animeWriter = supabase as SupabaseClient<any>;
	const { data, error } = await animeWriter.from("anime").insert(payload).select("id").single();

	if (error) return fail(500, { message: `登録エラー: ${error.message}` });
	return { success: true, animeId: String((data as { id: number }).id) };
}

export async function updateAnimeAction(
	supabase: SupabaseClient<Database>,
	request: Request,
	animeId: string,
	currentCoverUrl: string | null,
): Promise<AnimeWriteResult> {
	const fd = await request.formData();
	const payload = await buildAnimePayload(supabase, fd, currentCoverUrl);
	if ("status" in payload) return payload;

	// biome-ignore lint/suspicious/noExplicitAny: shared writer must tolerate generated type lag after migrations
	const animeWriter = supabase as SupabaseClient<any>;
	const { data, error } = await animeWriter.from("anime").update(payload).eq("id", animeId).select("id").single();

	if (error) return fail(500, { message: `更新エラー: ${error.message}` });
	return { success: true, animeId: String((data as { id: number }).id) };
}
