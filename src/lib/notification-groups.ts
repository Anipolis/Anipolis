import type { Notification } from "$lib/types";

/** 通知1件の表示。アクティビティへのいいねは、同じ記録への分を others にまとめる */
export interface NotificationEntry {
	notif: Notification;
	/** まとめた、ほかの人のいいね（新しい順） */
	others: Notification[];
}

/**
 * アクティビティへのいいね（181）を、同じ記録ごとに一番新しい1件へまとめる
 * （「〇〇さんほか2人が…」）。ほかの通知はそのまま並べる
 */
export function groupActivityLikes(notifications: readonly Notification[]): NotificationEntry[] {
	const entries: NotificationEntry[] = [];
	const byActivity = new Map<string, NotificationEntry>();
	for (const notif of notifications) {
		if (notif.type === "activity_like" && notif.activity_id) {
			const existing = byActivity.get(notif.activity_id);
			if (existing) {
				existing.others.push(notif);
				continue;
			}
			const entry = { notif, others: [] };
			byActivity.set(notif.activity_id, entry);
			entries.push(entry);
			continue;
		}
		entries.push({ notif, others: [] });
	}
	return entries;
}
