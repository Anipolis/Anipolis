import type { AnimeStatus } from "$lib/types";

/** アクティビティに流すステータス（181。視聴予定・視聴中・完了） */
export type ActivityStatus = Extract<AnimeStatus, "plan_to_watch" | "watching" | "completed">;

export interface ActivityUser {
	id: string;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
}

/** フォロー中の人のマイリストの動き1件（1作品） */
export interface MylistActivity {
	id: string;
	created_at: string;
	status: ActivityStatus;
	/** そのときのスコア（付けていなければ null） */
	score: number | null;
	user: ActivityUser;
	anime: { id: string; title: string; cover_url: string | null };
	like_count: number;
	/** 自分がいいねしているか */
	liked: boolean;
}

/** 同じ人が同じステータスに続けて入れた分のまとまり。1件だけのこともある */
export interface ActivityGroup {
	key: string;
	user: ActivityUser;
	status: ActivityStatus;
	/** 新しい順 */
	items: MylistActivity[];
}

/** 続けて入れたとみなす間隔。前の作品から30分以内なら同じまとまりにする */
export const ACTIVITY_GROUP_WINDOW_MS = 30 * 60 * 1000;

/**
 * 新しい順の記録を、同じ人・同じステータスで30分以内に続いたものごとにまとめる（表示だけのまとめ）。
 * 間に別の人の記録が挟まっても同じまとまりに入れ、まとまりは一番新しい記録の位置に置く。
 */
export function groupActivities(items: readonly MylistActivity[]): ActivityGroup[] {
	const groups: ActivityGroup[] = [];
	const open = new Map<string, ActivityGroup>();
	for (const item of items) {
		const openKey = `${item.user.id}:${item.status}`;
		const group = open.get(openKey);
		const oldest = group?.items[group.items.length - 1];
		if (
			group &&
			oldest &&
			Date.parse(oldest.created_at) - Date.parse(item.created_at) <= ACTIVITY_GROUP_WINDOW_MS
		) {
			group.items.push(item);
			continue;
		}
		const created: ActivityGroup = { key: item.id, user: item.user, status: item.status, items: [item] };
		groups.push(created);
		open.set(openKey, created);
	}
	return groups;
}

const STATUS_PHRASES: Record<ActivityStatus, string> = {
	plan_to_watch: "視聴予定に追加しました",
	watching: "視聴中にしました",
	completed: "完了にしました",
};

/** 「を視聴中にしました」の「視聴中にしました」の部分 */
export function activityStatusPhrase(status: ActivityStatus): string {
	return STATUS_PHRASES[status];
}

export function isActivityStatus(value: unknown): value is ActivityStatus {
	return value === "plan_to_watch" || value === "watching" || value === "completed";
}
