import { describe, expect, it } from "vitest";
import {
	type RoomReminderRow,
	roomReminderStatus,
	roomReminderTime,
	roomReminderToastKey,
	roomSessionKey,
	toActiveRoomReminders,
	unreadRoomReminderCount,
} from "./room-reminders";

const now = new Date("2026-11-10T12:00:00Z");

function animeRow(overrides: Partial<RoomReminderRow> = {}): RoomReminderRow {
	return {
		id: "n1",
		read: false,
		created_at: "2026-11-10T11:55:00Z",
		broadcast_anime_id: 7,
		broadcast_scheduled_at: "2026-11-10T12:30:00Z",
		broadcast_room_date: "2026-11-10",
		event_id: null,
		broadcast_anime: { title: "作品A", cover_url: "https://example.com/a.avif", broadcast_duration_minutes: 30 },
		event: null,
		...overrides,
	};
}

describe("toActiveRoomReminders", () => {
	it("アニメはルームへ、イベントはイベントのページへつなぐ", () => {
		const reminders = toActiveRoomReminders(
			[
				animeRow(),
				animeRow({
					id: "n2",
					broadcast_anime_id: null,
					broadcast_room_date: null,
					event_id: "ev1",
					broadcast_anime: null,
					event: { title: "特番", duration_minutes: null },
				}),
			],
			now,
		);
		expect(reminders.map((reminder) => [reminder.title, reminder.href])).toEqual([
			["作品A", "/rooms/anime/7/2026-11-10"],
			["特番", "/events/ev1"],
		]);
	});

	it("放送が終わったものは出さない（長さが分からないアニメは30分、イベントは6時間で終わる）", () => {
		const reminders = toActiveRoomReminders(
			[
				animeRow({ id: "ended", broadcast_scheduled_at: "2026-11-10T11:00:00Z" }),
				animeRow({
					id: "airing",
					broadcast_anime_id: 8,
					broadcast_scheduled_at: "2026-11-10T11:45:00Z",
					broadcast_anime: { title: "作品B", cover_url: null, broadcast_duration_minutes: 0 },
				}),
				animeRow({
					id: "event",
					broadcast_anime_id: null,
					event_id: "ev1",
					broadcast_scheduled_at: "2026-11-10T07:00:00Z",
					broadcast_anime: null,
					event: { title: "特番", duration_minutes: null },
				}),
			],
			now,
		);
		expect(reminders.map((reminder) => reminder.id)).toEqual(["event", "airing"]);
	});

	it("当日の放送枠が延びていれば、その長さで終わりを決める", () => {
		const row = animeRow({ broadcast_scheduled_at: "2026-11-10T11:20:00Z" });
		expect(toActiveRoomReminders([row], now)).toEqual([]);
		const extended = toActiveRoomReminders([row], now, new Map([[roomSessionKey(7, "2026-11-10T11:20:00Z"), 60]]));
		expect(extended[0]?.ends_at).toBe("2026-11-10T12:20:00.000Z");
	});

	it("同じ放送で何度か鳴った分は1件にまとめ、一番新しい行の id を使い、1つでも未読なら未読", () => {
		const reminders = toActiveRoomReminders(
			[animeRow({ id: "5min", read: false }), animeRow({ id: "30min", read: true })],
			now,
		);
		expect(reminders).toHaveLength(1);
		expect(reminders[0]).toMatchObject({ id: "5min", read: false });
		expect(unreadRoomReminderCount(reminders)).toBe(1);

		const olderUnread = toActiveRoomReminders(
			[animeRow({ id: "5min", read: true }), animeRow({ id: "30min", read: false })],
			now,
		);
		expect(olderUnread[0]).toMatchObject({ id: "5min", read: false });
	});

	it("始まる順に並べる", () => {
		const reminders = toActiveRoomReminders(
			[
				animeRow({ id: "later", broadcast_anime_id: 9, broadcast_scheduled_at: "2026-11-10T13:00:00Z" }),
				animeRow({ id: "sooner" }),
			],
			now,
		);
		expect(reminders.map((reminder) => reminder.id)).toEqual(["sooner", "later"]);
	});
});

describe("roomReminderStatus / roomReminderTime", () => {
	it("始まる前は残り分、始まったら放送中", () => {
		expect(roomReminderStatus({ scheduled_at: "2026-11-10T12:04:10Z" }, now.getTime())).toBe("あと5分");
		expect(roomReminderStatus({ scheduled_at: "2026-11-10T12:00:00Z" }, now.getTime())).toBe("放送中");
	});

	it("時刻は日本時間で出す", () => {
		expect(roomReminderTime({ scheduled_at: "2026-11-10T12:30:00Z" })).toBe("21:30");
	});
});

describe("roomReminderToastKey", () => {
	it("同じ行でも、次のタイミングで鳴り直したら別の鍵になる（096 は行を書き換えて鳴らす）", () => {
		const [at30] = toActiveRoomReminders([animeRow({ created_at: "2026-11-10T12:00:00Z" })], now);
		const [at5] = toActiveRoomReminders([animeRow({ created_at: "2026-11-10T12:25:00Z" })], now);
		expect(at30?.id).toBe(at5?.id);
		if (!at30 || !at5) throw new Error("expected reminders");
		expect(roomReminderToastKey(at30)).not.toBe(roomReminderToastKey(at5));
	});
});
