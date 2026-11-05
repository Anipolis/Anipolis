import type { AnimeStatus, UserAnimeEntry } from "$lib/types";

/**
 * マイリストの保存フォームで送った内容を、保存後のエントリとして組み立てる。
 * 一覧ページは保存後に読み込み直さず（並び順が変わるため）、これでカードの表示だけを更新する
 */
export function entryFromForm(formData: FormData): UserAnimeEntry {
	const score = Number(formData.get("score") || 0);
	const progress = Number(formData.get("progress") || 0);
	return {
		status: String(formData.get("status")) as AnimeStatus,
		score: Number.isFinite(score) && score > 0 ? score : null,
		progress: Number.isFinite(progress) ? progress : 0,
		updated_at: new Date().toISOString(),
	};
}

/**
 * 保存の応答から、保存後のエントリを組み立てる。応答に保存した内容（entry）があればそれを使う
 * （トリガーが埋めた日付も入る）。メモや日付を送らなかった保存では、前のエントリの値を残す。
 */
export function savedEntryFromResult(
	resultData: unknown,
	formData: FormData,
	previous: UserAnimeEntry | null | undefined,
): UserAnimeEntry {
	const saved = (resultData as { entry?: UserAnimeEntry } | undefined)?.entry;
	const entry: UserAnimeEntry = saved ? { ...saved } : entryFromForm(formData);
	// 送らなかった欄（undefined）は前の値を残す
	for (const key of ["started_on", "finished_on", "note"] as const) {
		if (entry[key] === undefined && previous?.[key] !== undefined) entry[key] = previous[key];
	}
	return entry;
}
