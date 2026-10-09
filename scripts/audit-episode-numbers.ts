/**
 * 既存の放送ルームセッションの話数を監査する（GitHub #246）。
 *
 * しょぼい由来（schedule_source = 'syobocal'）のセッションを作品ごとに放送順へ並べ、
 * importer と同じ検査（総話数超過・急な飛び・重複・巻き戻り）を掛ける。
 * importer は未来のセッションしか作り直さないため、開催済みの誤った話数はここで直す。
 *
 *   pnpm audit:episode-numbers            # 一覧表示のみ（DB は書き換えない）
 *   pnpm audit:episode-numbers -- --apply # 異常行の episode_number を null にし、
 *                                         # source_snapshot.episode_anomaly に元の値と理由を残す
 *   pnpm audit:episode-numbers -- --anime 4   # 作品 id で絞り込み
 */
import { createClient } from "@supabase/supabase-js";
import {
	detectEpisodeAnomalies,
	type EpisodeAnomaly,
	type EpisodeCheckProgram,
	isAppliedEpisodeAnomaly,
	parseEpisodeCount,
} from "../src/lib/syobocal-episodes.ts";

type SessionRow = {
	id: string;
	anime_id: number;
	room_date: string;
	scheduled_at: string;
	episode_number: number | null;
	source_program_id: number | null;
	source_snapshot: Record<string, unknown> | null;
};

type AnimeRow = { id: number; title: string; episode_count: string | null };

function parseArgs(argv: string[]) {
	const options = { apply: false, animeId: null as number | null };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--apply") options.apply = true;
		else if (arg === "--anime") {
			const value = Number(argv[index + 1]);
			if (!Number.isInteger(value)) throw new Error("--anime には作品 id を指定してください");
			options.animeId = value;
			index += 1;
		} else if (arg === "--" || arg === undefined) {
			// pnpm が付ける区切りは無視
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return options;
}

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

async function fetchAllSessions(supabase: ReturnType<typeof getSupabaseClient>, animeId: number | null) {
	const rows: SessionRow[] = [];
	const pageSize = 1000;
	for (let from = 0; ; from += pageSize) {
		let query = supabase
			.from("broadcast_room_sessions")
			.select("id,anime_id,room_date,scheduled_at,episode_number,source_program_id,source_snapshot")
			.eq("schedule_source", "syobocal")
			.eq("room_kind", "episode")
			.order("anime_id", { ascending: true })
			.order("scheduled_at", { ascending: true })
			.range(from, from + pageSize - 1);
		if (animeId !== null) query = query.eq("anime_id", animeId);
		const { data, error } = await query;
		if (error) throw new Error(`Could not read broadcast_room_sessions: ${error.message}`);
		rows.push(...((data ?? []) as SessionRow[]));
		if (!data || data.length < pageSize) break;
	}
	return rows;
}

async function fetchAnime(supabase: ReturnType<typeof getSupabaseClient>, ids: number[]) {
	const byId = new Map<number, AnimeRow>();
	for (let start = 0; start < ids.length; start += 200) {
		const { data, error } = await supabase
			.from("anime")
			.select("id,title,episode_count")
			.in("id", ids.slice(start, start + 200));
		if (error) throw new Error(`Could not read anime: ${error.message}`);
		for (const row of (data ?? []) as AnimeRow[]) byId.set(row.id, row);
	}
	return byId;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const supabase = getSupabaseClient();
	const sessions = await fetchAllSessions(supabase, options.animeId);
	const byAnime = new Map<number, SessionRow[]>();
	for (const session of sessions) {
		const values = byAnime.get(session.anime_id) ?? [];
		values.push(session);
		byAnime.set(session.anime_id, values);
	}
	const anime = await fetchAnime(supabase, [...byAnime.keys()]);

	type Finding = EpisodeAnomaly & { session: SessionRow };
	const findings: Finding[] = [];
	for (const [animeId, rows] of byAnime) {
		// pid が無い古い行は行の順番で代用する（検出結果の照合にだけ使う）
		const programs: (EpisodeCheckProgram & { session: SessionRow })[] = rows.map((session, index) => ({
			pid: session.source_program_id ?? -(index + 1),
			startsAt: session.scheduled_at,
			episodeNumber: session.episode_number,
			session,
		}));
		const byPid = new Map(programs.map((program) => [program.pid, program.session]));
		const episodeCount = parseEpisodeCount(anime.get(animeId)?.episode_count);
		for (const anomaly of detectEpisodeAnomalies(programs, episodeCount)) {
			const session = byPid.get(anomaly.pid);
			if (session) findings.push({ ...anomaly, session });
		}
	}

	const numbered = sessions.filter((session) => session.episode_number !== null).length;
	console.log(
		`Checked ${sessions.length} syobocal sessions (${numbered} numbered) across ${byAnime.size} anime; ${findings.length} anomalies.`,
	);
	const byKind = new Map<string, number>();
	for (const finding of findings) byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
	for (const [kind, count] of byKind) console.log(`  ${kind}: ${count}`);

	for (const finding of findings) {
		const title = anime.get(finding.session.anime_id);
		console.log(
			`${finding.session.anime_id}\t${title?.title ?? "?"}\t${finding.session.room_date}\tep ${finding.episodeNumber}/${title?.episode_count ?? "?"}\t${finding.kind}\t${finding.detail}`,
		);
	}

	const applicable = findings.filter((finding) => isAppliedEpisodeAnomaly(finding.kind));
	if (!options.apply) {
		if (applicable.length > 0) {
			console.log(
				`Dry run: pass --apply to clear episode_number on ${applicable.length} rows (count_mismatch rows are report-only).`,
			);
		}
		return;
	}

	let updated = 0;
	for (const finding of applicable) {
		// 開場済みセッションは 104 の凍結トリガーで直接 UPDATE できないため、
		// 131 の service_role 専用 RPC で話数だけを訂正する（元の Count と理由は snapshot に残る）
		const { data, error } = await supabase.rpc("correct_broadcast_room_session_episode", {
			p_session_id: finding.session.id,
			p_episode_number: null,
			p_anomaly: {
				kind: finding.kind,
				applied: true,
				syobocal_count: finding.episodeNumber,
				detail: finding.detail,
				audited_at: new Date().toISOString(),
			},
		});
		if (error) throw new Error(`Could not correct session ${finding.session.id}: ${error.message}`);
		if (data === true) updated += 1;
	}
	console.log(
		`Cleared episode_number on ${updated} sessions (original Count kept in source_snapshot.episode_anomaly).`,
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
