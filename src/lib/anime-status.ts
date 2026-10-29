import type { AnimeStatus } from "$lib/types";

/** マイリストのステータスの表示名とアイコン（プロフィールのマイリストタブと同じ） */
export const ANIME_STATUS_LABELS: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断",
	dropped: "断念",
};

export const ANIME_STATUS_ICONS: Record<AnimeStatus, string> = {
	watching: "i-lucide-circle-play",
	completed: "i-lucide-circle-check",
	plan_to_watch: "i-lucide-clipboard-list",
	on_hold: "i-lucide-circle-pause",
	dropped: "i-lucide-circle-x",
};
