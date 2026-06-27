import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTitleSearchFilter } from "$lib/server/queries";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import type { Database } from "$lib/supabase/database.types";
import type { RoomExperimentAnimeSearchResult, RoomExperimentDashboardRun, RoomExperimentRun } from "$lib/types";
import {
	calculateRoomExperimentMetrics,
	type ExperimentPostCandidate,
	type ExperimentRoomInput,
	type ExperimentVisitInput,
	filterRoomExperimentPosts,
	ROOM_EXPERIMENT_HEARTBEAT_INTERVAL_MS,
	ROOM_EXPERIMENT_STALE_AFTER_MS,
} from "./room-experiment-metrics";

// biome-ignore lint/suspicious/noExplicitAny: new room experiment tables may lag behind linked Supabase type generation
type AnySupabase = SupabaseClient<any>;

type RunRow = {
	id: string;
	anime_id: number;
	started_at: string;
	ended_at: string | null;
	label: string | null;
	notes: string | null;
	anime: { title: string; cover_url: string | null } | { title: string; cover_url: string | null }[] | null;
};

type VisitRow = {
	id: string;
	run_id: string;
	anime_id: number;
	broadcast_room_session_id: string;
	user_id: string;
	entered_at: string;
	last_seen_at: string;
	exited_at: string | null;
	session:
		| {
				id: string;
				room_date: string;
				room_kind: string;
				room_key: string;
				scheduled_at: string;
				posting_closes_at: string | null;
		  }
		| {
				id: string;
				room_date: string;
				room_kind: string;
				room_key: string;
				scheduled_at: string;
				posting_closes_at: string | null;
		  }[]
		| null;
};

type PostRow = ExperimentPostCandidate & {
	session:
		| {
				id: string;
				anime_id: number;
				room_date: string;
				room_kind: string;
				room_key: string;
				scheduled_at: string;
				posting_closes_at: string | null;
		  }
		| {
				id: string;
				anime_id: number;
				room_date: string;
				room_kind: string;
				room_key: string;
				scheduled_at: string;
				posting_closes_at: string | null;
		  }[]
		| null;
};

type SessionInfo = {
	id: string;
	anime_id?: number;
	room_date: string;
	room_kind: string;
	room_key: string;
	scheduled_at: string;
	posting_closes_at: string | null;
};

function asAny(supabase: SupabaseClient<Database>): AnySupabase {
	return supabase as unknown as AnySupabase;
}

export function createRoomExperimentServiceClient(): SupabaseClient<Database> | null {
	try {
		return createServiceRoleClient();
	} catch (error) {
		console.error("room experiment service client unavailable:", error);
		return null;
	}
}

function firstMaybeArray<T>(value: T | T[] | null): T | null {
	if (Array.isArray(value)) return value[0] ?? null;
	return value;
}

function toDashboardRun(row: RunRow, rooms: ExperimentRoomInput[]): RoomExperimentDashboardRun {
	const anime = firstMaybeArray(row.anime);
	const metrics = calculateRoomExperimentMetrics({
		id: row.id,
		started_at: row.started_at,
		ended_at: row.ended_at,
		rooms,
	});
	return {
		id: row.id,
		anime_id: String(row.anime_id),
		anime_title: anime?.title ?? `#${row.anime_id}`,
		anime_cover_url: anime?.cover_url ?? null,
		started_at: row.started_at,
		ended_at: row.ended_at,
		label: row.label,
		notes: row.notes,
		summary: metrics.summary,
		rooms: metrics.rooms.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")),
	};
}

function roomTitle(session: SessionInfo): string {
	if (session.room_key && session.room_key !== session.room_date) return session.room_key;
	return session.room_date;
}

function shouldIncludeSessionForRun(session: SessionInfo, run: RunRow): boolean {
	if (session.anime_id !== run.anime_id) return false;
	if (!session.posting_closes_at) return true;

	const roomClosesMs = new Date(session.posting_closes_at).getTime();
	const runStartsMs = new Date(run.started_at).getTime();
	if (!Number.isFinite(roomClosesMs) || !Number.isFinite(runStartsMs)) return true;
	return roomClosesMs >= runStartsMs;
}

function getSessionFromVisit(row: VisitRow): SessionInfo | null {
	const session = firstMaybeArray(row.session);
	return session
		? {
				id: session.id,
				room_date: session.room_date,
				room_kind: session.room_kind,
				room_key: session.room_key,
				scheduled_at: session.scheduled_at,
				posting_closes_at: session.posting_closes_at,
			}
		: null;
}

function getSessionFromPost(row: PostRow): SessionInfo | null {
	const session = firstMaybeArray(row.session);
	return session
		? {
				id: session.id,
				anime_id: session.anime_id,
				room_date: session.room_date,
				room_kind: session.room_kind,
				room_key: session.room_key,
				scheduled_at: session.scheduled_at,
				posting_closes_at: session.posting_closes_at,
			}
		: null;
}

export async function getActiveRoomExperimentRunForAnime(
	supabase: SupabaseClient<Database>,
	animeId: string | number,
): Promise<RoomExperimentRun | null> {
	const { data, error } = await asAny(supabase)
		.from("room_experiment_runs")
		.select(
			"id, anime_id, started_at, ended_at, label, notes, anime:anime!room_experiment_runs_anime_id_fkey ( title, cover_url )",
		)
		.eq("anime_id", Number(animeId))
		.is("ended_at", null)
		.maybeSingle();

	if (error || !data) return null;
	const row = data as unknown as RunRow;
	const anime = firstMaybeArray(row.anime);
	return {
		id: row.id,
		anime_id: String(row.anime_id),
		anime_title: anime?.title ?? `#${row.anime_id}`,
		anime_cover_url: anime?.cover_url ?? null,
		started_at: row.started_at,
		ended_at: row.ended_at,
		label: row.label,
		notes: row.notes,
	};
}

export async function searchRoomExperimentAnime(
	supabase: SupabaseClient<Database>,
	query: string,
): Promise<RoomExperimentAnimeSearchResult[]> {
	const trimmed = query.trim().replace(/[%,]/g, "");
	if (!trimmed) return [];

	const [{ data: animeRows }, { data: activeRuns }] = await Promise.all([
		asAny(supabase)
			.from("anime")
			.select("id, title, cover_url, room_type")
			.or(buildTitleSearchFilter(trimmed))
			.order("title", { ascending: true })
			.limit(10),
		asAny(supabase).from("room_experiment_runs").select("id, anime_id").is("ended_at", null),
	]);

	const activeRunByAnime = new Map(
		((activeRuns ?? []) as unknown as Array<{ id: string; anime_id: number }>).map((run) => [
			String(run.anime_id),
			run.id,
		]),
	);

	return (
		(animeRows ?? []) as unknown as Array<{
			id: number;
			title: string;
			cover_url: string | null;
			room_type: string;
		}>
	).map((row) => ({
		id: String(row.id),
		title: row.title,
		cover_url: row.cover_url,
		room_type: row.room_type,
		active_run_id: activeRunByAnime.get(String(row.id)) ?? null,
	}));
}

export async function startRoomExperimentRun(
	supabase: SupabaseClient<Database>,
	adminId: string,
	options: { animeId: string; label: string | null; notes: string | null },
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
	if (!/^\d+$/.test(options.animeId)) {
		return { ok: false, status: 400, message: "作品IDが不正です" };
	}

	const { error } = await asAny(supabase)
		.from("room_experiment_runs")
		.insert({
			anime_id: Number(options.animeId),
			created_by: adminId,
			label: options.label || null,
			notes: options.notes || null,
		});

	if (!error) return { ok: true };
	if (error.code === "23505") return { ok: false, status: 409, message: "この作品はすでに検証対象です" };
	console.error("room experiment run start error:", error);
	return { ok: false, status: 500, message: "検証runの開始に失敗しました" };
}

export async function stopRoomExperimentRun(
	supabase: SupabaseClient<Database>,
	adminId: string,
	runId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
	const { error } = await asAny(supabase)
		.from("room_experiment_runs")
		.update({ ended_at: new Date().toISOString(), ended_by: adminId })
		.eq("id", runId)
		.is("ended_at", null);

	if (!error) return { ok: true };
	console.error("room experiment run stop error:", error);
	return { ok: false, status: 500, message: "検証runの停止に失敗しました" };
}

export async function createRoomExperimentVisit(
	supabase: SupabaseClient<Database>,
	userId: string,
	options: { sessionId: string; clientVisitKey: string; userAgent: string | null },
): Promise<
	| { tracked: true; visitId: string; heartbeatIntervalMs: number; staleAfterMs: number }
	| { tracked: false }
	| { error: true; status: number; message: string }
> {
	const sessionId = options.sessionId.trim();
	const clientVisitKey = options.clientVisitKey.trim();
	if (!clientVisitKey || clientVisitKey.length > 120) {
		return { error: true, status: 400, message: "client_visit_keyが不正です" };
	}

	const { data: session } = await asAny(supabase)
		.from("broadcast_room_sessions")
		.select("id, anime_id, room_kind")
		.eq("id", sessionId)
		.maybeSingle();
	if (!session || session.room_kind !== "episode") return { tracked: false };

	const { data: run } = await asAny(supabase)
		.from("room_experiment_runs")
		.select("id, anime_id")
		.eq("anime_id", session.anime_id)
		.is("ended_at", null)
		.maybeSingle();
	if (!run) return { tracked: false };

	const now = new Date().toISOString();
	const { data, error } = await asAny(supabase)
		.from("room_experiment_visits")
		.upsert(
			{
				run_id: run.id,
				anime_id: run.anime_id,
				broadcast_room_session_id: session.id,
				user_id: userId,
				client_visit_key: clientVisitKey,
				last_seen_at: now,
				exited_at: null,
				user_agent: options.userAgent?.slice(0, 500) ?? null,
			},
			{ onConflict: "run_id,user_id,broadcast_room_session_id,client_visit_key" },
		)
		.select("id")
		.single();

	if (error || !data) {
		console.error("room experiment visit create error:", error);
		return { error: true, status: 500, message: "visitの作成に失敗しました" };
	}

	return {
		tracked: true,
		visitId: data.id,
		heartbeatIntervalMs: ROOM_EXPERIMENT_HEARTBEAT_INTERVAL_MS,
		staleAfterMs: ROOM_EXPERIMENT_STALE_AFTER_MS,
	};
}

export async function heartbeatRoomExperimentVisit(
	supabase: SupabaseClient<Database>,
	userId: string,
	visitId: string,
): Promise<void> {
	const { data: visit } = await asAny(supabase)
		.from("room_experiment_visits")
		.select("id, heartbeat_count, run:room_experiment_runs!room_experiment_visits_run_id_fkey ( ended_at )")
		.eq("id", visitId)
		.eq("user_id", userId)
		.maybeSingle();
	if (!visit) return;

	const run = firstMaybeArray(visit.run as { ended_at: string | null } | { ended_at: string | null }[] | null);
	if (run?.ended_at) return;

	await asAny(supabase)
		.from("room_experiment_visits")
		.update({
			last_seen_at: new Date().toISOString(),
			heartbeat_count: Number(visit.heartbeat_count ?? 0) + 1,
		})
		.eq("id", visitId)
		.eq("user_id", userId);
}

export async function exitRoomExperimentVisit(
	supabase: SupabaseClient<Database>,
	userId: string,
	visitId: string,
): Promise<void> {
	const { data: visit } = await asAny(supabase)
		.from("room_experiment_visits")
		.select("id, exited_at")
		.eq("id", visitId)
		.eq("user_id", userId)
		.maybeSingle();
	if (!visit) return;

	const now = new Date().toISOString();
	await asAny(supabase)
		.from("room_experiment_visits")
		.update({
			last_seen_at: now,
			...(visit.exited_at ? {} : { exited_at: now }),
		})
		.eq("id", visitId)
		.eq("user_id", userId);
}

export async function getRoomExperimentDashboardData(
	supabase: SupabaseClient<Database>,
	searchQuery: string,
): Promise<{ runs: RoomExperimentDashboardRun[]; searchResults: RoomExperimentAnimeSearchResult[] }> {
	const [searchResults, { data: runRows }] = await Promise.all([
		searchRoomExperimentAnime(supabase, searchQuery),
		asAny(supabase)
			.from("room_experiment_runs")
			.select(
				"id, anime_id, started_at, ended_at, label, notes, anime:anime!room_experiment_runs_anime_id_fkey ( title, cover_url )",
			)
			.is("ended_at", null)
			.order("started_at", { ascending: false }),
	]);

	const runs = ((runRows ?? []) as unknown as RunRow[]) ?? [];
	if (runs.length === 0) return { runs: [], searchResults };

	const runIds = runs.map((run) => run.id);
	const animeIds = [...new Set(runs.map((run) => run.anime_id))];
	const earliestStartedAt = runs.map((run) => run.started_at).sort()[0];

	const [{ data: visitRows }, { data: postRows }, { data: sessionRows }] = await Promise.all([
		asAny(supabase)
			.from("room_experiment_visits")
			.select(
				"id, run_id, anime_id, broadcast_room_session_id, user_id, entered_at, last_seen_at, exited_at, session:broadcast_room_sessions!room_experiment_visits_broadcast_room_session_id_fkey ( id, room_date, room_kind, room_key, scheduled_at, posting_closes_at )",
			)
			.in("run_id", runIds),
		asAny(supabase)
			.from("posts")
			.select(
				"id, user_id, broadcast_room_session_id, created_at, parent_id, hidden_by_admin, session:broadcast_room_sessions!posts_broadcast_room_session_id_fkey ( id, anime_id, room_date, room_kind, room_key, scheduled_at, posting_closes_at )",
			)
			.in("anime_id", animeIds)
			.not("broadcast_room_session_id", "is", null)
			.gte("created_at", earliestStartedAt),
		asAny(supabase)
			.from("broadcast_room_sessions")
			.select("id, anime_id, room_date, room_kind, room_key, scheduled_at, posting_closes_at")
			.in("anime_id", animeIds)
			.eq("room_kind", "episode"),
	]);

	const visits = ((visitRows ?? []) as unknown as VisitRow[]).filter((row) => {
		const session = getSessionFromVisit(row);
		return session?.room_kind === "episode";
	});
	const posts = ((postRows ?? []) as unknown as PostRow[]).filter((row) => {
		const session = getSessionFromPost(row);
		return session?.room_kind === "episode";
	});
	const sessions = ((sessionRows ?? []) as unknown as SessionInfo[]).filter((row) => row.room_kind === "episode");

	return {
		searchResults,
		runs: runs.map((run) => {
			const sessionById = new Map<string, SessionInfo>();
			const visitsBySession = new Map<string, ExperimentVisitInput[]>();
			const postsBySession = new Map<string, ExperimentPostCandidate[]>();

			for (const session of sessions) {
				if (shouldIncludeSessionForRun(session, run)) sessionById.set(session.id, session);
			}

			for (const visit of visits.filter((row) => row.run_id === run.id)) {
				const session = getSessionFromVisit(visit);
				if (!session) continue;
				sessionById.set(session.id, session);
				const group = visitsBySession.get(session.id) ?? [];
				group.push({
					user_id: visit.user_id,
					entered_at: visit.entered_at,
					last_seen_at: visit.last_seen_at,
					exited_at: visit.exited_at,
				});
				visitsBySession.set(session.id, group);
			}

			for (const post of posts) {
				const session = getSessionFromPost(post);
				if (!session || session.anime_id !== run.anime_id) continue;
				sessionById.set(session.id, session);
				const group = postsBySession.get(session.id) ?? [];
				group.push(post);
				postsBySession.set(session.id, group);
			}

			const rooms = [...sessionById.values()].map((session) => ({
				broadcast_room_session_id: session.id,
				room_title: roomTitle(session),
				scheduled_at: session.scheduled_at,
				posting_closes_at: session.posting_closes_at,
				visits: visitsBySession.get(session.id) ?? [],
				posts: filterRoomExperimentPosts(postsBySession.get(session.id) ?? [], {
					sessionId: session.id,
					runStartedAt: run.started_at,
					runEndedAt: run.ended_at,
				}),
			}));

			return toDashboardRun(run, rooms);
		}),
	};
}
