/**
 * 話数ルームにつながっていない放送枠を、話数ルームか特番ルームにつなぐ（#484、migration 175 の後に実行）。
 *
 *   pnpm backfill:episode-room-sessions              … 一覧を出すだけ（dry-run）
 *   pnpm backfill:episode-room-sessions -- --apply   … 書き込む
 *   ステージング: node --env-file=.env.staging --import ./scripts/loaders/register-lib-alias.mjs \
 *                   --experimental-strip-types scripts/backfill-episode-room-sessions.ts [--apply]
 *
 * どこにつなぐかは src/lib/server/episode-room-backfill.ts（作品ページの推定と同じ規則）で決める。
 *   - 推定の話数がある枠: episode_number を保存する → 放送枠のトリガーが話数ルームにつなぐ
 *   - 推定できない枠: episode_number を NULL のまま更新し直す → 175 のトリガーが特番ルームにつなぐ
 * どちらも「まだどこにもつながっていない枠」だけを条件に更新するので、繰り返し実行してよい。
 */
import { createClient } from "@supabase/supabase-js";
import type { BackfillAnime, BackfillPlan, BackfillSession } from "../src/lib/server/episode-room-backfill.ts";
import { planEpisodeRoomBackfill } from "../src/lib/server/episode-room-backfill.ts";
import type { BroadcastRoomOverride } from "../src/lib/types.ts";

const url = process.env["PUBLIC_SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) throw new Error("PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY が必要です");
const apply = process.argv.includes("--apply");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await build(from, from + PAGE - 1);
		if (error) throw error;
		rows.push(...(data ?? []));
		if ((data ?? []).length < PAGE) return rows;
	}
}

/** 投稿が 1 件以上ある放送枠の id */
async function sessionsWithPosts(sessionIds: readonly string[]) {
	const found = new Set<string>();
	for (let index = 0; index < sessionIds.length; index += 100) {
		const chunk = sessionIds.slice(index, index + 100);
		const rows = await fetchAll<{ broadcast_room_session_id: string }>((from, to) =>
			supabase
				.from("posts")
				.select("broadcast_room_session_id")
				.in("broadcast_room_session_id", chunk)
				.order("id")
				.range(from, to),
		);
		for (const row of rows) found.add(row.broadcast_room_session_id);
	}
	return found;
}

const unroomed = await fetchAll<{ anime_id: number }>((from, to) =>
	supabase
		.from("broadcast_room_sessions")
		.select("anime_id")
		.eq("room_kind", "episode")
		.is("episode_room_id", null)
		.order("id")
		.range(from, to),
);
const animeIds = [...new Set(unroomed.map((row) => row.anime_id))].sort((a, b) => a - b);
console.log(
	`接続先: ${new URL(url).hostname.split(".")[0]}  ${apply ? "書き込みます（--apply）" : "dry-run（書き込みません）"}`,
);
console.log(`つながっていない放送枠: ${unroomed.length} 件 / ${animeIds.length} 作品\n`);

const totals = { assign: 0, special: 0, cancelled: 0, leave: 0, failed: 0 };
const specialReasons = new Map<string, number>();

for (const animeId of animeIds) {
	const { data: animeRow, error: animeError } = await supabase
		.from("anime")
		.select(
			"id, title, type, room_type, season, aired_from, aired_to, broadcast_day, broadcast_time, episode_total",
		)
		.eq("id", animeId)
		.single();
	if (animeError || !animeRow) throw animeError ?? new Error(`anime ${animeId} not found`);
	const sessionRows = await fetchAll<
		Omit<BackfillSession, "episode_anomaly_applied" | "has_posts"> & { source_snapshot: unknown }
	>((from, to) =>
		supabase
			.from("broadcast_room_sessions")
			.select(
				"id, room_date, episode_number, episode_title, episode_room_id, posting_opens_at, posting_closes_at, schedule_source, source_snapshot",
			)
			.eq("anime_id", animeId)
			.eq("room_kind", "episode")
			.order("room_date")
			.range(from, to),
	);
	const { data: overrides, error: overridesError } = await supabase
		.from("broadcast_room_overrides")
		.select("*")
		.eq("anime_id", animeId);
	if (overridesError) throw overridesError;

	const anime = { ...animeRow, id: String(animeRow.id) } as unknown as BackfillAnime;
	// 投稿の残っている、つながっていない枠（締め切った古い枠でも、そのままにせず特番ルームに入れる）
	const withPosts = await sessionsWithPosts(
		sessionRows.filter((row) => row.episode_room_id === null).map((row) => row.id),
	);
	// 取り込みの検査で話数が疑わしいとして話数を空にした枠（import-syobocal が source_snapshot.episode_anomaly に残す）
	const anomalyBySession = new Map<string, Record<string, unknown>>();
	const sessions: BackfillSession[] = sessionRows.map(({ source_snapshot, ...row }) => {
		const anomaly = (source_snapshot as { episode_anomaly?: Record<string, unknown> } | null)?.episode_anomaly;
		if (anomaly) anomalyBySession.set(row.id, anomaly);
		return { ...row, episode_anomaly_applied: anomaly?.["applied"] === true, has_posts: withPosts.has(row.id) };
	});
	const plan: BackfillPlan = planEpisodeRoomBackfill(anime, sessions, (overrides ?? []) as BroadcastRoomOverride[]);
	const numbers = plan.assign.map((item) => item.episodeNumber);
	console.log(
		`#${animeId} ${(animeRow as { title: string }).title}: 話数 ${plan.assign.length}` +
			(numbers.length > 0 ? `（第${Math.min(...numbers)}〜${Math.max(...numbers)}話）` : "") +
			` / 特番 ${plan.special.length} / そのまま ${plan.leave.length} / 休止 ${plan.cancelled.length}`,
	);
	for (const item of plan.special) {
		console.log(`    特番 ${item.date}: ${item.reason}`);
		const reason = item.reason.replace(/[0-9０-９-]+/g, "N").replace(/「.*」/, "「…」");
		specialReasons.set(reason, (specialReasons.get(reason) ?? 0) + 1);
	}
	totals.assign += plan.assign.length;
	totals.special += plan.special.length;
	totals.cancelled += plan.cancelled.length;
	totals.leave += plan.leave.length;

	if (!apply) continue;
	for (const item of plan.assign) {
		// 話数の付いた枠・開場済みの枠は予定が凍結されている（104 / 131）。話数だけを直せる正式な RPC を使う。
		// 話数が疑わしいとされていた枠は、元の判定を残したまま「推定で埋めた」ことを書き添える
		const anomaly = anomalyBySession.get(item.sessionId);
		const { data: updated, error } = await supabase.rpc("correct_broadcast_room_session_episode", {
			p_session_id: item.sessionId,
			p_episode_number: item.episodeNumber,
			...(anomaly
				? {
						p_anomaly: {
							...anomaly,
							applied: false,
							resolved_by: "backfill-episode-room-sessions (#484)",
							resolved_at: new Date().toISOString(),
						},
					}
				: {}),
		});
		if (error || updated !== true) {
			totals.failed += 1;
			console.error(`    失敗 ${item.date}（第${item.episodeNumber}話）:`, error?.message ?? "更新されなかった");
		}
	}
	for (const item of plan.special) {
		// episode_number を同じ値（NULL）で更新し直し、175 のトリガーで特番ルームにつなぐ
		const { error } = await supabase
			.from("broadcast_room_sessions")
			.update({ episode_number: null })
			.eq("id", item.sessionId)
			.is("episode_room_id", null);
		if (error) {
			totals.failed += 1;
			console.error(`    失敗 ${item.date}（特番）:`, error.message);
		}
	}
}

console.log(
	`\n合計: 話数ルームへ ${totals.assign} 件 / 特番ルームへ ${totals.special} 件 / 締め切った古い枠でそのまま ${totals.leave} 件 / 休止日で触らない ${totals.cancelled} 件` +
		(apply ? ` / 失敗 ${totals.failed} 件` : ""),
);
if (specialReasons.size > 0) {
	console.log("特番ルームに入る理由:");
	for (const [reason, count] of [...specialReasons].sort((a, b) => b[1] - a[1]))
		console.log(`  ${count} 件  ${reason}`);
}

if (apply) {
	const { count } = await supabase
		.from("broadcast_room_sessions")
		.select("id", { count: "exact", head: true })
		.eq("room_kind", "episode")
		.is("episode_room_id", null);
	console.log(
		`\n書き込み後も、つながっていない放送枠: ${count ?? "?"} 件（休止日の枠と、締め切った古い枠でそのままにした枠が残る）`,
	);
}
