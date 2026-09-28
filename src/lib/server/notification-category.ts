import type { NotificationCategory } from "./actions";

const CATEGORIES: readonly NotificationCategory[] = ["normal", "room", "mylist"];

/** 通知ページのタブ／既読 API が受け取るカテゴリ文字列を検証する */
export function parseNotificationCategory(value: unknown): NotificationCategory | null {
	if (typeof value !== "string") return null;
	return (CATEGORIES as readonly string[]).includes(value) ? (value as NotificationCategory) : null;
}
