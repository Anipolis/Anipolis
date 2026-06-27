import { describe, expect, it } from "vitest";
import { calculateRoomExperimentMetrics, filterRoomExperimentPosts } from "./room-experiment-metrics";

type CalculatedRoom = ReturnType<typeof calculateRoomExperimentMetrics>["rooms"][number];

const runStartedAt = "2026-06-27T10:00:00.000Z";
const runEndedAt = "2026-06-27T11:00:00.000Z";
const roomClosesAt = "2026-06-27T10:30:00.000Z";

function firstRoom(metrics: ReturnType<typeof calculateRoomExperimentMetrics>): CalculatedRoom {
	const [room] = metrics.rooms;
	if (!room) throw new Error("expected at least one room metric");
	return room;
}

describe("calculateRoomExperimentMetrics", () => {
	it("calculates stay, active, bounce, and early-exit metrics", () => {
		const metrics = calculateRoomExperimentMetrics(
			{
				id: "run-1",
				started_at: runStartedAt,
				ended_at: null,
				rooms: [
					{
						broadcast_room_session_id: "session-1",
						room_title: "2026-06-27",
						scheduled_at: runStartedAt,
						posting_closes_at: roomClosesAt,
						visits: [
							{
								user_id: "u1",
								entered_at: "2026-06-27T10:00:00.000Z",
								last_seen_at: "2026-06-27T10:05:00.000Z",
								exited_at: "2026-06-27T10:05:00.000Z",
							},
							{
								user_id: "u2",
								entered_at: "2026-06-27T10:10:00.000Z",
								last_seen_at: "2026-06-27T10:10:30.000Z",
								exited_at: "2026-06-27T10:10:30.000Z",
							},
							{
								user_id: "u3",
								entered_at: "2026-06-27T10:20:00.000Z",
								last_seen_at: "2026-06-27T10:29:30.000Z",
								exited_at: null,
							},
						],
						posts: [
							{ user_id: "u1", created_at: "2026-06-27T10:06:00.000Z" },
							{ user_id: "u1", created_at: "2026-06-27T10:07:00.000Z" },
						],
					},
				],
			},
			new Date("2026-06-27T10:30:00.000Z"),
			90_000,
		);

		const room = firstRoom(metrics);
		expect(room.visit_count).toBe(3);
		expect(room.unique_visitor_count).toBe(3);
		expect(room.active_visit_count).toBe(1);
		expect(room.poster_count).toBe(1);
		expect(room.posting_rate).toBeCloseTo(1 / 3);
		expect(room.posts_per_poster).toBe(2);
		expect(room.posts_per_unique_visitor).toBeCloseTo(2 / 3);
		expect(room.average_stay_seconds).toBeCloseTo((300 + 30 + 570) / 3);
		expect(room.bounce_rate_under_60s).toBeCloseTo(1 / 2);
		expect(room.early_exit_rate).toBe(1);
	});

	it("caps stay at posting close and run end", () => {
		const metrics = calculateRoomExperimentMetrics(
			{
				id: "run-1",
				started_at: runStartedAt,
				ended_at: "2026-06-27T10:20:00.000Z",
				rooms: [
					{
						broadcast_room_session_id: "session-1",
						room_title: "2026-06-27",
						scheduled_at: runStartedAt,
						posting_closes_at: roomClosesAt,
						visits: [
							{
								user_id: "u1",
								entered_at: "2026-06-27T10:00:00.000Z",
								last_seen_at: "2026-06-27T10:40:00.000Z",
								exited_at: null,
							},
						],
						posts: [],
					},
				],
			},
			new Date("2026-06-27T10:25:00.000Z"),
		);

		const room = firstRoom(metrics);
		expect(room.active_visit_count).toBe(0);
		expect(room.average_stay_seconds).toBe(20 * 60);
	});

	it("uses last_seen without early-exit rate when posting close is missing", () => {
		const metrics = calculateRoomExperimentMetrics({
			id: "run-1",
			started_at: runStartedAt,
			ended_at: null,
			rooms: [
				{
					broadcast_room_session_id: "session-1",
					room_title: "2026-06-27",
					scheduled_at: runStartedAt,
					posting_closes_at: null,
					visits: [
						{
							user_id: "u1",
							entered_at: "2026-06-27T10:00:00.000Z",
							last_seen_at: "2026-06-27T10:02:00.000Z",
							exited_at: null,
						},
					],
					posts: [],
				},
			],
		});

		const room = firstRoom(metrics);
		expect(room.average_stay_seconds).toBe(120);
		expect(room.early_exit_rate).toBeNull();
	});

	it("excludes visits entered after posting close from stay denominators", () => {
		const metrics = calculateRoomExperimentMetrics({
			id: "run-1",
			started_at: runStartedAt,
			ended_at: null,
			rooms: [
				{
					broadcast_room_session_id: "session-1",
					room_title: "2026-06-27",
					scheduled_at: runStartedAt,
					posting_closes_at: roomClosesAt,
					visits: [
						{
							user_id: "u1",
							entered_at: "2026-06-27T10:31:00.000Z",
							last_seen_at: "2026-06-27T10:40:00.000Z",
							exited_at: "2026-06-27T10:40:00.000Z",
						},
					],
					posts: [],
				},
			],
		});

		const room = firstRoom(metrics);
		expect(room.visit_count).toBe(1);
		expect(room.average_stay_seconds).toBeNull();
		expect(room.bounce_rate_under_60s).toBeNull();
		expect(room.early_exit_rate).toBeNull();
	});

	it("deduplicates summary visitors and posters across rooms", () => {
		const metrics = calculateRoomExperimentMetrics({
			id: "run-1",
			started_at: runStartedAt,
			ended_at: null,
			rooms: [
				{
					broadcast_room_session_id: "session-1",
					room_title: "1",
					scheduled_at: runStartedAt,
					posting_closes_at: roomClosesAt,
					visits: [
						{
							user_id: "u1",
							entered_at: "2026-06-27T10:00:00.000Z",
							last_seen_at: "2026-06-27T10:02:00.000Z",
							exited_at: "2026-06-27T10:02:00.000Z",
						},
					],
					posts: [
						{ user_id: "u1", created_at: "2026-06-27T10:03:00.000Z" },
						{ user_id: "u2", created_at: "2026-06-27T10:04:00.000Z" },
					],
				},
				{
					broadcast_room_session_id: "session-2",
					room_title: "2",
					scheduled_at: runStartedAt,
					posting_closes_at: roomClosesAt,
					visits: [
						{
							user_id: "u1",
							entered_at: "2026-06-27T10:05:00.000Z",
							last_seen_at: "2026-06-27T10:06:00.000Z",
							exited_at: "2026-06-27T10:06:00.000Z",
						},
						{
							user_id: "u2",
							entered_at: "2026-06-27T10:07:00.000Z",
							last_seen_at: "2026-06-27T10:08:00.000Z",
							exited_at: "2026-06-27T10:08:00.000Z",
						},
					],
					posts: [{ user_id: "u1", created_at: "2026-06-27T10:09:00.000Z" }],
				},
			],
		});

		expect(metrics.rooms.reduce((sum, room) => sum + room.unique_visitor_count, 0)).toBe(3);
		expect(metrics.summary.unique_visitor_count).toBe(2);
		expect(metrics.summary.poster_count).toBe(2);
		expect(metrics.summary.posting_rate).toBe(1);
		expect(metrics.summary.posts_per_poster).toBeCloseTo(3 / 2);
		expect(metrics.summary.posts_per_unique_visitor).toBeCloseTo(3 / 2);
	});

	it("returns zero ratios when poster or visitor denominators are empty", () => {
		const metrics = calculateRoomExperimentMetrics({
			id: "run-1",
			started_at: runStartedAt,
			ended_at: null,
			rooms: [
				{
					broadcast_room_session_id: "session-1",
					room_title: "1",
					scheduled_at: runStartedAt,
					posting_closes_at: roomClosesAt,
					visits: [
						{
							user_id: "u1",
							entered_at: "2026-06-27T10:00:00.000Z",
							last_seen_at: "2026-06-27T10:01:00.000Z",
							exited_at: "2026-06-27T10:01:00.000Z",
						},
					],
					posts: [],
				},
				{
					broadcast_room_session_id: "session-2",
					room_title: "2",
					scheduled_at: runStartedAt,
					posting_closes_at: roomClosesAt,
					visits: [],
					posts: [{ user_id: "u2", created_at: "2026-06-27T10:02:00.000Z" }],
				},
			],
		});

		const [withVisitorNoPosts, withPostNoVisitors] = metrics.rooms;
		if (!withVisitorNoPosts || !withPostNoVisitors) throw new Error("expected two room metrics");
		expect(withVisitorNoPosts.posts_per_poster).toBe(0);
		expect(withVisitorNoPosts.posting_rate).toBe(0);
		expect(withPostNoVisitors.posting_rate).toBe(0);
		expect(withPostNoVisitors.posts_per_unique_visitor).toBe(0);
	});
});

describe("filterRoomExperimentPosts", () => {
	it("filters by run window, top-level status, and hidden flag", () => {
		const posts = filterRoomExperimentPosts(
			[
				{
					id: "before",
					user_id: "u1",
					broadcast_room_session_id: "session-1",
					created_at: "2026-06-27T09:59:00.000Z",
					parent_id: null,
					hidden_by_admin: false,
				},
				{
					id: "visible",
					user_id: "u1",
					broadcast_room_session_id: "session-1",
					created_at: "2026-06-27T10:05:00.000Z",
					parent_id: null,
					hidden_by_admin: false,
				},
				{
					id: "reply",
					user_id: "u2",
					broadcast_room_session_id: "session-1",
					created_at: "2026-06-27T10:06:00.000Z",
					parent_id: "parent",
					hidden_by_admin: false,
				},
				{
					id: "hidden",
					user_id: "u3",
					broadcast_room_session_id: "session-1",
					created_at: "2026-06-27T10:07:00.000Z",
					parent_id: null,
					hidden_by_admin: true,
				},
				{
					id: "other-session",
					user_id: "u4",
					broadcast_room_session_id: "session-2",
					created_at: "2026-06-27T10:08:00.000Z",
					parent_id: null,
					hidden_by_admin: false,
				},
				{
					id: "ended",
					user_id: "u5",
					broadcast_room_session_id: "session-1",
					created_at: runEndedAt,
					parent_id: null,
					hidden_by_admin: false,
				},
			],
			{ sessionId: "session-1", runStartedAt, runEndedAt },
		);

		expect(posts).toEqual([{ user_id: "u1", created_at: "2026-06-27T10:05:00.000Z" }]);
	});

	it("treats nullable hidden_by_admin as visible unless it is true", () => {
		const posts = filterRoomExperimentPosts(
			[
				{
					id: "nullable-visible",
					user_id: "u1",
					broadcast_room_session_id: "session-1",
					created_at: "2026-06-27T10:05:00.000Z",
					parent_id: null,
					hidden_by_admin: null,
				},
			],
			{ sessionId: "session-1", runStartedAt, runEndedAt: null },
		);

		expect(posts).toHaveLength(1);
	});
});
