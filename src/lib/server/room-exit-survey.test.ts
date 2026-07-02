import { describe, expect, it, vi } from "vitest";
import {
	isDuplicateRoomExitSurveyError,
	parseRoomExitSurveyRequest,
	ROOM_EXIT_SURVEY_VERSION,
	saveRoomExitSurveyResponse,
	summarizeRoomExitSurveyRows,
	toRoomExitSurveyInsert,
} from "./room-exit-survey";

const sessionId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

function createValidatorClient(responses: Record<string, { data: unknown; error: unknown }>) {
	return {
		from: vi.fn((table: string) => {
			const chain = {
				select: vi.fn(() => chain),
				eq: vi.fn(() => chain),
				maybeSingle: vi.fn(async () => responses[table] ?? { data: null, error: null }),
			};
			return chain;
		}),
	};
}

function createWriterClient(error: unknown = null) {
	const insert = vi.fn(async () => ({ error }));
	return {
		client: {
			from: vi.fn(() => ({ insert })),
		},
		insert,
	};
}

function skipRequest() {
	const parsed = parseRoomExitSurveyRequest({
		action: "skip",
		anime_id: 123,
		broadcast_room_session_id: sessionId,
		experiment_run_id: runId,
		stayed_seconds: 200,
		post_count: 1,
	});
	if (!parsed.ok) throw new Error("unexpected parse result");
	return parsed.value;
}

describe("parseRoomExitSurveyRequest", () => {
	it("accepts a complete submit payload", () => {
		const parsed = parseRoomExitSurveyRequest({
			action: "submit",
			anime_id: 123,
			broadcast_room_session_id: sessionId,
			experiment_run_id: runId,
			stayed_seconds: 181,
			post_count: 1,
			answers: {
				overallRating: 5,
				sharedExperienceRating: 4,
				readabilityRating: 3,
				nextParticipation: "want_join",
				comparisonWithX: "anipolis_better",
				goodPoints: "  live flow was fun  ",
				improvementPoints: "",
			},
		});

		expect(parsed.ok).toBe(true);
		if (!parsed.ok || parsed.value.action !== "submit") throw new Error("unexpected parse result");
		expect(parsed.value.surveyVersion).toBe(ROOM_EXIT_SURVEY_VERSION);
		expect(parsed.value.answers.goodPoints).toBe("live flow was fun");
		expect(parsed.value.answers.improvementPoints).toBeNull();
	});

	it("rejects submit payloads with missing required answers", () => {
		const parsed = parseRoomExitSurveyRequest({
			action: "submit",
			anime_id: 123,
			broadcast_room_session_id: sessionId,
			experiment_run_id: runId,
			stayed_seconds: 181,
			post_count: 0,
			answers: {
				overallRating: 5,
				sharedExperienceRating: 4,
				readabilityRating: 3,
				nextParticipation: "want_join",
			},
		});

		expect(parsed.ok).toBe(false);
	});

	it("accepts skip payloads without answers", () => {
		const parsed = parseRoomExitSurveyRequest({
			action: "skip",
			anime_id: 123,
			broadcast_room_session_id: sessionId,
			experiment_run_id: runId,
			stayed_seconds: 20,
			post_count: 0,
		});

		expect(parsed.ok).toBe(true);
		if (!parsed.ok) throw new Error("unexpected parse result");
		expect(parsed.value.action).toBe("skip");
	});
});

describe("toRoomExitSurveyInsert", () => {
	it("builds a skipped insert row", () => {
		const parsed = parseRoomExitSurveyRequest({
			action: "skip",
			anime_id: 123,
			broadcast_room_session_id: sessionId,
			experiment_run_id: runId,
			stayed_seconds: 20,
			post_count: 0,
		});
		if (!parsed.ok) throw new Error("unexpected parse result");

		expect(toRoomExitSurveyInsert("user-1", parsed.value)).toMatchObject({
			user_id: "user-1",
			anime_id: 123,
			broadcast_room_session_id: sessionId,
			experiment_run_id: runId,
			skipped: true,
			answers: {},
		});
	});
});

describe("isDuplicateRoomExitSurveyError", () => {
	it("detects unique violation errors", () => {
		expect(isDuplicateRoomExitSurveyError({ code: "23505" })).toBe(true);
		expect(isDuplicateRoomExitSurveyError({ code: "42501" })).toBe(false);
	});
});

describe("saveRoomExitSurveyResponse", () => {
	it("requires a matching experiment visit before inserting", async () => {
		const writer = createWriterClient();
		const result = await saveRoomExitSurveyResponse(
			writer.client as never,
			createValidatorClient({
				broadcast_room_sessions: {
					data: {
						id: sessionId,
						anime_id: 123,
						room_kind: "episode",
						posting_closes_at: "2026-07-02T10:30:00Z",
					},
					error: null,
				},
				room_experiment_runs: {
					data: { id: runId, anime_id: 123, started_at: "2026-07-02T10:00:00Z", ended_at: null },
					error: null,
				},
				room_experiment_visits: { data: null, error: null },
			}) as never,
			userId,
			skipRequest(),
		);

		expect(result).toEqual({ ok: false, status: 403, message: "Survey target visit was not found" });
		expect(writer.insert).not.toHaveBeenCalled();
	});

	it("inserts when run, session, and visit match", async () => {
		const writer = createWriterClient();
		const result = await saveRoomExitSurveyResponse(
			writer.client as never,
			createValidatorClient({
				broadcast_room_sessions: {
					data: {
						id: sessionId,
						anime_id: 123,
						room_kind: "episode",
						posting_closes_at: "2026-07-02T10:30:00Z",
					},
					error: null,
				},
				room_experiment_runs: {
					data: { id: runId, anime_id: 123, started_at: "2026-07-02T10:00:00Z", ended_at: null },
					error: null,
				},
				room_experiment_visits: { data: { id: "visit-1" }, error: null },
			}) as never,
			userId,
			skipRequest(),
		);

		expect(result).toEqual({ ok: true });
		expect(writer.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: userId, skipped: true }));
	});
});

describe("summarizeRoomExitSurveyRows", () => {
	it("summarizes averages, option distributions, skips, and comments", () => {
		const summary = summarizeRoomExitSurveyRows([
			{
				broadcast_room_session_id: sessionId,
				room_title: "1話",
				submitted_at: "2026-07-02T10:00:00.000Z",
				stayed_seconds: 240,
				post_count: 2,
				overall_rating: 5,
				shared_experience_rating: 4,
				readability_rating: 3,
				next_participation: "want_join",
				comparison_with_x: "anipolis_better",
				good_points: "Fun",
				improvement_points: null,
				skipped: false,
			},
			{
				broadcast_room_session_id: sessionId,
				room_title: "1話",
				submitted_at: "2026-07-02T11:00:00.000Z",
				stayed_seconds: 60,
				post_count: 0,
				overall_rating: null,
				shared_experience_rating: null,
				readability_rating: null,
				next_participation: null,
				comparison_with_x: null,
				good_points: null,
				improvement_points: null,
				skipped: true,
			},
		]);

		expect(summary.response_count).toBe(2);
		expect(summary.submitted_count).toBe(1);
		expect(summary.skipped_count).toBe(1);
		expect(summary.average_overall_rating).toBe(5);
		expect(summary.next_participation_counts.want_join).toBe(1);
		expect(summary.comparison_with_x_counts.anipolis_better).toBe(1);
		expect(summary.comments).toHaveLength(1);
		expect(summary.comments[0]?.good_points).toBe("Fun");
	});
});
