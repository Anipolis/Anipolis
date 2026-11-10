/**
 * カレンダーでベルを付けた番組・イベントの「もうすぐ始まる」お知らせ。
 * 通知の行（type = broadcast）は選んだタイミング（1分前・5分前・30分前）で鳴るたびに作られるが、
 * 履歴としては残さず、放送が終わるまでカレンダーの上と右下（スマホは上）の小さな表示に出す。
 */
export interface RoomReminder {
	/** 番組の中で一番新しく鳴った通知の行の id。小さな表示は id ごとに一度だけ出す */
	id: string;
	title: string;
	cover_url: string | null;
	href: string;
	scheduled_at: string;
	ends_at: string;
	/** 同じ番組の行がすべて既読か（カレンダーを開くと既読になる） */
	read: boolean;
}

export interface RoomReminderRow {
	id: string;
	read: boolean;
	broadcast_anime_id: number | string | null;
	broadcast_scheduled_at: string | null;
	broadcast_room_date: string | null;
	event_id: string | null;
	broadcast_anime:
		| { title: string; cover_url: string | null; broadcast_duration_minutes: number | null }
		| { title: string; cover_url: string | null; broadcast_duration_minutes: number | null }[]
		| null;
	event:
		| { title: string; duration_minutes: number | null }
		| { title: string; duration_minutes: number | null }[]
		| null;
}

// 放送の長さが分からないときの既定（アニメは30分枠、イベントはイベントルームと同じ6時間）
const DEFAULT_ANIME_MINUTES = 30;
const DEFAULT_EVENT_MINUTES = 6 * 60;
/** これより前に始まった放送のお知らせは読まない（イベントの既定の長さより長く取る） */
export const ROOM_REMINDER_LOOKBACK_MS = 24 * 60 * 60_000;

function one<T>(value: T | T[] | null): T | null {
	return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * 新しい順の通知の行から、まだ終わっていない番組のお知らせを1番組1件にまとめて、始まる順に返す
 */
export function toActiveRoomReminders(rows: RoomReminderRow[], now: Date): RoomReminder[] {
	const byBroadcast = new Map<string, RoomReminder>();
	for (const row of rows) {
		if (!row.broadcast_scheduled_at) continue;
		const scheduledMs = Date.parse(row.broadcast_scheduled_at);
		if (Number.isNaN(scheduledMs)) continue;
		const event = one(row.event);
		const anime = one(row.broadcast_anime);
		let key: string;
		let reminder: Omit<RoomReminder, "id" | "read">;
		if (row.event_id) {
			const minutes = event?.duration_minutes || DEFAULT_EVENT_MINUTES;
			key = `event:${row.event_id}:${scheduledMs}`;
			reminder = {
				title: event?.title ?? "イベント",
				cover_url: null,
				href: `/events/${row.event_id}`,
				scheduled_at: row.broadcast_scheduled_at,
				ends_at: new Date(scheduledMs + minutes * 60_000).toISOString(),
			};
		} else if (row.broadcast_anime_id != null) {
			const minutes = anime?.broadcast_duration_minutes || DEFAULT_ANIME_MINUTES;
			const animeId = String(row.broadcast_anime_id);
			key = `anime:${animeId}:${row.broadcast_room_date ?? scheduledMs}`;
			reminder = {
				title: anime?.title ?? "登録したアニメ",
				cover_url: anime?.cover_url ?? null,
				href: row.broadcast_room_date
					? `/rooms/anime/${animeId}/${row.broadcast_room_date}`
					: `/anime/${animeId}`,
				scheduled_at: row.broadcast_scheduled_at,
				ends_at: new Date(scheduledMs + minutes * 60_000).toISOString(),
			};
		} else {
			continue;
		}
		if (Date.parse(reminder.ends_at) <= now.getTime()) continue;
		const existing = byBroadcast.get(key);
		if (existing) {
			// 行は新しい順なので、id は先に見た（一番新しく鳴った）行のまま。未読が1つでもあれば未読
			if (!row.read) existing.read = false;
			continue;
		}
		byBroadcast.set(key, { id: row.id, read: row.read, ...reminder });
	}
	return [...byBroadcast.values()].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
}

export function unreadRoomReminderCount(reminders: readonly RoomReminder[]): number {
	return reminders.filter((reminder) => !reminder.read).length;
}

/** 「あと12分」「放送中」 */
export function roomReminderStatus(reminder: Pick<RoomReminder, "scheduled_at">, now: number): string {
	const diff = Date.parse(reminder.scheduled_at) - now;
	if (diff <= 0) return "放送中";
	return `あと${Math.ceil(diff / 60_000)}分`;
}

/** 「21:00」（カレンダーと同じく日本時間。サーバーで描画しても UTC にならない） */
export function roomReminderTime(reminder: Pick<RoomReminder, "scheduled_at">): string {
	return new Date(reminder.scheduled_at).toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Asia/Tokyo",
	});
}
