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
