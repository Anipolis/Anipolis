import { describe, expect, it } from "vitest";
import type { BroadcastRoomOverride } from "$lib/types";
import { type BackfillAnime, type BackfillSession, planEpisodeRoomBackfill } from "./episode-room-backfill";

// broadcast_day/time を null にして、今日基準の合成補完を切り、放送枠だけで決定的に確かめる
const NOW = new Date("2026-10-22T00:00:00+09:00");
const TV: BackfillAnime = {
	id: "54",
	type: "TV",
	room_type: "episode",
	season: "2026-spring",
	aired_from: "2026-04-02",
	aired_to: "2026-06-18",
	broadcast_day: null,
	broadcast_time: null,
	episode_total: 12,
};

/** 4/2 から毎週の放送枠。roomed を渡すとその番号の枠は話数ルームにつながっている */
function weekly(
	count: number,
	options: { numbered?: Record<number, number>; roomed?: number[]; source?: string | null } = {},
) {
	return Array.from({ length: count }, (_, index): BackfillSession => {
		const date = new Date(Date.UTC(2026, 3, 2 + index * 7)).toISOString().slice(0, 10);
		const episodeNumber = options.numbered?.[index] ?? null;
		return {
			id: `s${index + 1}`,
			room_date: date,
			episode_number: episodeNumber,
			episode_title: null,
			episode_room_id: options.roomed?.includes(index) ? `room-${index}` : null,
			posting_opens_at: `${date}T14:55:00Z`,
			posting_closes_at: `${date}T16:00:00Z`,
			schedule_source: options.source === undefined ? "syobocal" : options.source,
			episode_anomaly_applied: false,
			has_posts: false,
		};
	});
}

function cancelled(roomDate: string): BroadcastRoomOverride {
	return {
		id: "o1",
		anime_id: 54,
		room_date: roomDate,
		override_kind: "cancelled",
		broadcast_time: null,
		duration_minutes: null,
		pre_open_minutes: null,
		post_close_minutes: null,
		episode_start: null,
		episode_end: null,
		episode_label: null,
		episode_count_increment: null,
		is_cancelled: true,
		announcement_label: null,
		note: null,
		created_at: "2026-04-01T00:00:00Z",
	};
}

describe("planEpisodeRoomBackfill（#484）", () => {
	it("しょぼいの話数が無い放送済みの作品は、第1話からの週次カウントで話数を保存する（霧尾ファンクラブの形）", () => {
		const plan = planEpisodeRoomBackfill(TV, weekly(12), [], NOW);
		expect(plan.assign.map((item) => item.episodeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
		expect(plan.assign[0]).toEqual({ sessionId: "s1", date: "2026-04-02", episodeNumber: 1 });
		expect(plan.special).toEqual([]);
	});

	it("しょぼいの話数（アンカー）があれば、そこから逆算する。アンカーより後の話数の無い回は特番ルームに入れる", () => {
		// 5 回目（index 4）がしょぼい由来の第5話で、話数ルームにつながっている。
		// 作品ページの推定と同じく、アンカーより後ろの回には番号を振らない（特番・総集編の恐れがある）
		const plan = planEpisodeRoomBackfill(TV, weekly(6, { numbered: { 4: 5 }, roomed: [4] }), [], NOW);
		expect(plan.assign.map((item) => [item.date, item.episodeNumber])).toEqual([
			["2026-04-02", 1],
			["2026-04-09", 2],
			["2026-04-16", 3],
			["2026-04-23", 4],
		]);
		expect(plan.special.map((item) => item.date)).toEqual(["2026-05-07"]);
		// つながっている枠（s5）には触らない
		expect([...plan.assign, ...plan.special].some((item) => item.sessionId === "s5")).toBe(false);
	});

	it("休止日の枠は触らず、残りは休止日を飛ばして数える", () => {
		const plan = planEpisodeRoomBackfill(TV, weekly(4), [cancelled("2026-04-16")], NOW);
		expect(plan.cancelled).toEqual([{ sessionId: "s3", date: "2026-04-16" }]);
		expect(plan.assign.map((item) => [item.date, item.episodeNumber])).toEqual([
			["2026-04-02", 1],
			["2026-04-09", 2],
			["2026-04-23", 3],
		]);
	});

	it("総話数を超える推定は、誤りの恐れがあるので特番ルームに入れる", () => {
		const plan = planEpisodeRoomBackfill({ ...TV, episode_total: 10 }, weekly(12), [], NOW);
		expect(plan.assign).toHaveLength(10);
		expect(plan.special.map((item) => item.date)).toEqual(["2026-06-11", "2026-06-18"]);
		expect(plan.special[0]?.reason).toContain("総話数 10 を超える");
	});

	it("推定が別の日の話数の付いた枠と重なるときは、推定を使わず特番ルームに入れる", () => {
		// しょぼい由来の第2話が 4/30（つながっている）にあるのに、前進カウントでは 4/9 も第2話になる形
		const sessions = weekly(3);
		sessions.push({
			id: "s-anchor",
			room_date: "2026-04-30",
			episode_number: 2,
			episode_title: null,
			episode_room_id: "room-2",
			posting_opens_at: "2026-04-30T14:55:00Z",
			posting_closes_at: "2026-04-30T16:00:00Z",
			schedule_source: "syobocal",
			episode_anomaly_applied: false,
			has_posts: false,
		});
		const plan = planEpisodeRoomBackfill(TV, sessions, [], NOW);
		for (const item of plan.assign) expect(item.episodeNumber).not.toBe(2);
		expect(plan.assign.length + plan.special.length).toBe(3);
	});

	it("話数ルームの無い作品（映画など）の枠は、話数を推定せず特番ルームに入れる", () => {
		const plan = planEpisodeRoomBackfill({ ...TV, type: "Movie" }, weekly(2), [], NOW);
		expect(plan.assign).toEqual([]);
		expect(plan.special.map((item) => item.reason)).toEqual(["話数ルームの無い作品", "話数ルームの無い作品"]);
	});

	it("つながっていない枠が無ければ何もしない", () => {
		expect(
			planEpisodeRoomBackfill(TV, weekly(3, { numbered: { 0: 1, 1: 2, 2: 3 }, roomed: [0, 1, 2] }), [], NOW),
		).toEqual({
			assign: [],
			special: [],
			cancelled: [],
			leave: [],
		});
	});

	it("締め切った古い枠（曜日と時刻から作ったもの）で推定できないものは、特番ルームを作らずそのままにする", () => {
		const plan = planEpisodeRoomBackfill({ ...TV, episode_total: 10 }, weekly(12, { source: null }), [], NOW);
		expect(plan.assign).toHaveLength(10);
		expect(plan.special).toEqual([]);
		expect(plan.leave.map((item) => item.date)).toEqual(["2026-06-11", "2026-06-18"]);
	});

	it("締め切った古い枠でも、投稿が残っていれば特番ルームに入れる（ルームログからたどれるように）", () => {
		const sessions = weekly(12, { source: null }).map((session, index) =>
			index === 10 ? { ...session, has_posts: true } : session,
		);
		const plan = planEpisodeRoomBackfill({ ...TV, episode_total: 10 }, sessions, [], NOW);
		expect(plan.special.map((item) => item.date)).toEqual(["2026-06-11"]);
		expect(plan.leave.map((item) => item.date)).toEqual(["2026-06-18"]);
	});

	it("しょぼい由来の枠や、まだ投稿を受け付ける古い枠は、推定できなければ特番ルームに入れる", () => {
		const future = weekly(1, { source: null }).map((session) => ({
			...session,
			posting_closes_at: "2026-10-30T00:00:00Z",
		}));
		const plan = planEpisodeRoomBackfill({ ...TV, type: "Movie" }, future, [], NOW);
		expect(plan.special).toHaveLength(1);
		expect(plan.leave).toEqual([]);
	});

	it("話数が疑わしいとして話数を空にした本編の回は、副題があっても前後の回から話数を推定する", () => {
		// 第1・2・4話はしょぼいの話数つき（つながっている）。3 回目は副題「ゲオルギーネの来訪」付きで、話数が疑わしい
		const sessions = weekly(4, { numbered: { 0: 1, 1: 2, 3: 4 }, roomed: [0, 1, 3] }).map((session, index) =>
			index === 2 ? { ...session, episode_title: "ゲオルギーネの来訪", episode_anomaly_applied: true } : session,
		);
		const plan = planEpisodeRoomBackfill(TV, sessions, [], NOW);
		expect(plan.assign).toEqual([{ sessionId: "s3", date: "2026-04-16", episodeNumber: 3 }]);
		expect(plan.special).toEqual([]);
	});

	it("話数の疑わしさとは関係なく副題だけの回（特番）は、特番ルームに入れる", () => {
		const sessions = weekly(4, { numbered: { 0: 1, 1: 2, 3: 3 }, roomed: [0, 1, 3] }).map((session, index) =>
			index === 2 ? { ...session, episode_title: "スペシャル特番" } : session,
		);
		const plan = planEpisodeRoomBackfill(TV, sessions, [], NOW);
		expect(plan.assign).toEqual([]);
		expect(plan.special.map((item) => [item.date, item.reason])).toEqual([
			["2026-04-16", "ラベル「スペシャル特番」"],
		]);
	});

	it("しょぼいの回数が重複した回は、前後に穴が無ければ推定せず特番ルームに入れる（再放送とは決めつけない）", () => {
		// 再放送の印の付いた番組は取り込みで除外済みなので、重複はデータの誤りの恐れがある（人が確かめる）
		const sessions = weekly(4, { numbered: { 0: 1, 1: 2, 2: 3 }, roomed: [0, 1, 2] }).map((session, index) =>
			index === 3 ? { ...session, episode_title: "副題", episode_anomaly_applied: true } : session,
		);
		const plan = planEpisodeRoomBackfill(TV, sessions, [], NOW);
		expect(plan.assign).toEqual([]);
		expect(plan.special.map((item) => item.date)).toEqual(["2026-04-23"]);
	});

	it("管理者が上書きで総集編・特番にした回は、話数の分かる回に挟まれていても番号を振らない（#485 Codex）", () => {
		// 第2話と第4話の間に、副題なし・上書きのラベル「総集編」の回がある
		const sessions = weekly(4, { numbered: { 0: 1, 1: 2, 3: 4 }, roomed: [0, 1, 3] });
		const recap = {
			...cancelled("2026-04-16"),
			is_cancelled: false,
			override_kind: "recap" as const,
			episode_label: "総集編",
		};
		const plan = planEpisodeRoomBackfill(TV, sessions, [recap], NOW);
		expect(plan.assign).toEqual([]);
		expect(plan.special.map((item) => item.date)).toEqual(["2026-04-16"]);
	});

	it("話数のカウントを進めない上書き（episode_count_increment = 0）の回も、穴埋めの対象にしない", () => {
		const sessions = weekly(4, { numbered: { 0: 1, 1: 2, 3: 4 }, roomed: [0, 1, 3] }).map((session, index) =>
			index === 2 ? { ...session, episode_title: "副題", episode_anomaly_applied: true } : session,
		);
		const noCount = {
			...cancelled("2026-04-16"),
			is_cancelled: false,
			override_kind: "custom" as const,
			episode_count_increment: 0,
		};
		const plan = planEpisodeRoomBackfill(TV, sessions, [noCount], NOW);
		expect(plan.assign).toEqual([]);
	});
});
