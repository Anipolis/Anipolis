import type { AnimeStatus } from "$lib/types";

/** 全話数が分からない作品の上限（押し間違いで極端な値にしない） */
const MAX_PROGRESS_WITHOUT_TOTAL = 9999;

type ProgressEntry = { status: AnimeStatus; progress: number };

/**
 * 話数を1話進める・戻したときの変更。話数に合わせて視聴ステータスも変える:
 * 最終話まで進めたら「完了」、視聴予定で見始めたら「視聴中」、最終話の完了から戻したら「視聴中」。
 * 変わらないときは null
 */
export function stepProgress(
	entry: ProgressEntry,
	delta: 1 | -1,
	total: number | null,
): { progress: number; status?: AnimeStatus } | null {
	const limit = total ?? MAX_PROGRESS_WITHOUT_TOTAL;
	if (delta > 0 && entry.progress >= limit) return null;
	const progress = Math.min(limit, Math.max(0, entry.progress + delta));
	if (progress === entry.progress) return null;

	let status: AnimeStatus = entry.status;
	if (delta > 0 && progress === total) status = "completed";
	else if (delta > 0 && entry.status === "plan_to_watch") status = "watching";
	else if (delta < 0 && entry.status === "completed" && entry.progress === total) status = "watching";

	return status === entry.status ? { progress } : { progress, status };
}
