import { writable } from "svelte/store";

/**
 * 未読バッジの再取得を layout に依頼するためのカウンター。
 * 通知ページが既読化に成功したときに増やすと、layout が
 * /api/notifications/unread-counts を即座に再取得する（30秒ポーリングを待たない）。
 */
export const notificationCountsRefresh = writable(0);

export function requestNotificationCountsRefresh() {
	notificationCountsRefresh.update((n) => n + 1);
}
