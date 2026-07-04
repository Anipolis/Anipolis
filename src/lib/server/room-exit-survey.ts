import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "$lib/supabase/database.types";
import type {
	RoomExitSurveyComment,
	RoomExitSurveyComparisonWithX,
	RoomExitSurveyNextParticipation,
	RoomExitSurveySummary,
} from "$lib/types";

export const ROOM_EXIT_SURVEY_VERSION = "room_exit_v1";

const MAX_FREE_TEXT_LENGTH = 1000;
const NEXT_PARTICIPATION_VALUES = ["must_join", "want_join", "not_sure", "not_really", "not_join"] as const;
const COMPARISON_WITH_X_VALUES = [
	"anipolis_better",
	"anipolis_slightly_better",
	"same",
	"x_slightly_better",
	"x_better",
	"cannot_compare",
] as const;

type RoomExitSurveyAction = "submit" | "skip";

export type RoomExitSurveyAnswers = {
	overallRating: number;
	sharedExperienceRating: number;
	readabilityRating: number;
	nextParticipation: RoomExitSurveyNextParticipation;
	comparisonWithX: RoomExitSurveyComparisonWithX;
	goodPoints: string | null;
	improvementPoints: string | null;
};

export type ParsedRoomExitSurveyRequest =
	| {
			action: "submit";
			animeId: number;
			broadcastRoomSessionId: string;
			experimentRunId: string;
			surveyVersion: string;
			stayedSeconds: number;
			postCount: number;
			answers: RoomExitSurveyAnswers;
	  }
	| {
			action: "skip";
			animeId: number;
			broadcastRoomSessionId: string;
			experimentRunId: string;
			surveyVersion: string;
			stayedSeconds: number;
			postCount: number;
	  };

export type RoomExitSurveyAggregateRow = {
	broadcast_room_session_id: string;
	room_title?: string | null;
	submitted_at: string;
	stayed_seconds: number;
	post_count: number;
	overall_rating: number | null;
	shared_experience_rating: number | null;
	readability_rating: number | null;
	next_participation: RoomExitSurveyNextParticipation | null;
	comparison_with_x: RoomExitSurveyComparisonWithX | null;
	good_points: string | null;
	improvement_points: string | null;
	skipped: boolean;
};

type ParseResult = { ok: true; value: ParsedRoomExitSurveyRequest } | { ok: false; status: number; message: string };

type SaveResult =
	| { ok: true; duplicate?: false }
	| { ok: true; duplicate: true }
	| { ok: false; status: number; message: string };

export type RoomExitSurveyLoadState = {
	alreadyAnswered: boolean;
	postCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAction(value: unknown): RoomExitSurveyAction | null {
	return value === "submit" || value === "skip" ? value : null;
}

function parsePositiveInteger(value: unknown): number | null {
	const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
	if (typeof numeric !== "number" || !Number.isSafeInteger(numeric) || numeric <= 0) return null;
	return numeric;
}

const POSTGRES_INT4_MAX = 2_147_483_647;

function parseNonNegativeInteger(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > POSTGRES_INT4_MAX) {
		return null;
	}
	return value;
}

function parseUuid(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
}

function parseRating(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isInteger(value)) return null;
	return value >= 1 && value <= 5 ? value : null;
}

function parseNextParticipation(value: unknown): RoomExitSurveyNextParticipation | null {
	return typeof value === "string" && NEXT_PARTICIPATION_VALUES.includes(value as RoomExitSurveyNextParticipation)
		? (value as RoomExitSurveyNextParticipation)
		: null;
}

function parseComparisonWithX(value: unknown): RoomExitSurveyComparisonWithX | null {
	return typeof value === "string" && COMPARISON_WITH_X_VALUES.includes(value as RoomExitSurveyComparisonWithX)
		? (value as RoomExitSurveyComparisonWithX)
		: null;
}

function normalizeFreeText(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, MAX_FREE_TEXT_LENGTH);
}

function parseSubmitAnswers(value: unknown): RoomExitSurveyAnswers | null {
	if (!isRecord(value)) return null;
	const overallRating = parseRating(value["overallRating"]);
	const sharedExperienceRating = parseRating(value["sharedExperienceRating"]);
	const readabilityRating = parseRating(value["readabilityRating"]);
	const nextParticipation = parseNextParticipation(value["nextParticipation"]);
	const comparisonWithX = parseComparisonWithX(value["comparisonWithX"]);
	if (
		overallRating == null ||
		sharedExperienceRating == null ||
		readabilityRating == null ||
		!nextParticipation ||
		!comparisonWithX
	) {
		return null;
	}

	return {
		overallRating,
		sharedExperienceRating,
		readabilityRating,
		nextParticipation,
		comparisonWithX,
		goodPoints: normalizeFreeText(value["goodPoints"]),
		improvementPoints: normalizeFreeText(value["improvementPoints"]),
	};
}

export function parseRoomExitSurveyRequest(body: unknown): ParseResult {
	if (!isRecord(body)) return { ok: false, status: 400, message: "Invalid request body" };

	const action = parseAction(body["action"]);
	const animeId = parsePositiveInteger(body["anime_id"]);
	const broadcastRoomSessionId = parseUuid(body["broadcast_room_session_id"]);
	const experimentRunId = parseUuid(body["experiment_run_id"]);
	const stayedSeconds = parseNonNegativeInteger(body["stayed_seconds"]);
	const postCount = parseNonNegativeInteger(body["post_count"]);
	const rawSurveyVersion = typeof body["survey_version"] === "string" ? body["survey_version"].trim() : "";
	if (rawSurveyVersion && rawSurveyVersion !== ROOM_EXIT_SURVEY_VERSION) {
		return { ok: false, status: 400, message: "Unsupported survey version" };
	}
	const surveyVersion = ROOM_EXIT_SURVEY_VERSION;

	if (
		!action ||
		!animeId ||
		!broadcastRoomSessionId ||
		!experimentRunId ||
		stayedSeconds == null ||
		postCount == null
	) {
		return { ok: false, status: 400, message: "Invalid survey metadata" };
	}

	if (action === "skip") {
		return {
			ok: true,
			value: {
				action,
				animeId,
				broadcastRoomSessionId,
				experimentRunId,
				surveyVersion,
				stayedSeconds,
				postCount,
			},
		};
	}

	const answers = parseSubmitAnswers(body["answers"]);
	if (!answers) return { ok: false, status: 400, message: "Invalid survey answers" };

	return {
		ok: true,
		value: {
			action,
			animeId,
			broadcastRoomSessionId,
			experimentRunId,
			surveyVersion,
			stayedSeconds,
			postCount,
			answers,
		},
	};
}

export function isDuplicateRoomExitSurveyError(error: unknown): boolean {
	return isRecord(error) && error["code"] === "23505";
}

function answersToJson(answers: RoomExitSurveyAnswers): Json {
	return {
		overallRating: answers.overallRating,
		sharedExperienceRating: answers.sharedExperienceRating,
		readabilityRating: answers.readabilityRating,
		nextParticipation: answers.nextParticipation,
		comparisonWithX: answers.comparisonWithX,
		goodPoints: answers.goodPoints,
		improvementPoints: answers.improvementPoints,
	};
}

export function toRoomExitSurveyInsert(
	userId: string,
	request: ParsedRoomExitSurveyRequest,
): Database["public"]["Tables"]["room_exit_survey_responses"]["Insert"] {
	if (request.action === "skip") {
		return {
			user_id: userId,
			anime_id: request.animeId,
			broadcast_room_session_id: request.broadcastRoomSessionId,
			experiment_run_id: request.experimentRunId,
			survey_version: request.surveyVersion,
			stayed_seconds: request.stayedSeconds,
			post_count: request.postCount,
			answers: {},
			skipped: true,
		};
	}

	return {
		user_id: userId,
		anime_id: request.animeId,
		broadcast_room_session_id: request.broadcastRoomSessionId,
		experiment_run_id: request.experimentRunId,
		survey_version: request.surveyVersion,
		stayed_seconds: request.stayedSeconds,
		post_count: request.postCount,
		overall_rating: request.answers.overallRating,
		shared_experience_rating: request.answers.sharedExperienceRating,
		readability_rating: request.answers.readabilityRating,
		next_participation: request.answers.nextParticipation,
		comparison_with_x: request.answers.comparisonWithX,
		good_points: request.answers.goodPoints,
		improvement_points: request.answers.improvementPoints,
		answers: answersToJson(request.answers),
		skipped: false,
	};
}

function isSessionInRunWindow(session: { posting_closes_at: string | null }, run: { started_at: string }): boolean {
	if (!session.posting_closes_at) return true;
	const roomClosesMs = new Date(session.posting_closes_at).getTime();
	const runStartsMs = new Date(run.started_at).getTime();
	if (!Number.isFinite(roomClosesMs) || !Number.isFinite(runStartsMs)) return true;
	return roomClosesMs >= runStartsMs;
}

export async function getRoomExitSurveyLoadState(
	supabase: SupabaseClient<Database>,
	userId: string | null | undefined,
	sessionId: string,
): Promise<RoomExitSurveyLoadState> {
	if (!userId) return { alreadyAnswered: false, postCount: 0 };

	const [surveyResponse, surveyPostCount] = await Promise.all([
		supabase
			.from("room_exit_survey_responses")
			.select("id")
			.eq("user_id", userId)
			.eq("broadcast_room_session_id", sessionId)
			.eq("survey_version", ROOM_EXIT_SURVEY_VERSION)
			.maybeSingle(),
		supabase
			.from("posts")
			.select("id", { count: "exact", head: true })
			.eq("user_id", userId)
			.eq("broadcast_room_session_id", sessionId)
			.is("parent_id", null)
			.eq("hidden_by_admin", false),
	]);

	if (surveyResponse.error) {
		console.error("room exit survey lookup failed:", surveyResponse.error);
	}
	if (surveyPostCount.error) {
		console.error("room exit survey post count lookup failed:", surveyPostCount.error);
	}

	return {
		alreadyAnswered: Boolean(surveyResponse.data),
		postCount: surveyPostCount.count ?? 0,
	};
}

export async function saveRoomExitSurveyResponse(
	writer: SupabaseClient<Database>,
	validator: SupabaseClient<Database>,
	userId: string,
	request: ParsedRoomExitSurveyRequest,
): Promise<SaveResult> {
	const [{ data: session, error: sessionError }, { data: run, error: runError }, { data: visit, error: visitError }] =
		await Promise.all([
			validator
				.from("broadcast_room_sessions")
				.select("id, anime_id, room_kind, posting_closes_at")
				.eq("id", request.broadcastRoomSessionId)
				.maybeSingle(),
			validator
				.from("room_experiment_runs")
				.select("id, anime_id, started_at, ended_at")
				.eq("id", request.experimentRunId)
				.maybeSingle(),
			validator
				.from("room_experiment_visits")
				.select("id")
				.eq("run_id", request.experimentRunId)
				.eq("broadcast_room_session_id", request.broadcastRoomSessionId)
				.eq("user_id", userId)
				.limit(1),
		]);

	if (sessionError || runError || visitError) {
		console.error("room exit survey validation query failed:", { sessionError, runError, visitError });
		return { ok: false, status: 500, message: "Survey validation failed" };
	}
	if (!session || !run || session.room_kind !== "episode") {
		return { ok: false, status: 400, message: "Survey target room is invalid" };
	}
	if (session.anime_id !== request.animeId || run.anime_id !== request.animeId) {
		return { ok: false, status: 400, message: "Survey target anime mismatch" };
	}
	if (run.ended_at) {
		return { ok: false, status: 400, message: "Survey target experiment has ended" };
	}
	if (!isSessionInRunWindow(session, run)) {
		return { ok: false, status: 400, message: "Survey target room is outside the experiment window" };
	}
	if (!visit || visit.length === 0) {
		return { ok: false, status: 403, message: "Survey target visit was not found" };
	}

	const { error } = await writer.from("room_exit_survey_responses").insert(toRoomExitSurveyInsert(userId, request));
	if (!error) return { ok: true };
	if (isDuplicateRoomExitSurveyError(error)) return { ok: true, duplicate: true };

	console.error("room exit survey insert failed:", error);
	return { ok: false, status: 500, message: "Survey insert failed" };
}

function emptyOptionCounts<T extends string>(values: readonly T[]): Record<T, number> {
	return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function createEmptySummary(): RoomExitSurveySummary {
	return {
		response_count: 0,
		submitted_count: 0,
		skipped_count: 0,
		average_overall_rating: null,
		average_shared_experience_rating: null,
		average_readability_rating: null,
		next_participation_counts: emptyOptionCounts(NEXT_PARTICIPATION_VALUES),
		comparison_with_x_counts: emptyOptionCounts(COMPARISON_WITH_X_VALUES),
		comments: [],
	};
}

function average(total: number, count: number): number | null {
	return count > 0 ? total / count : null;
}

export function summarizeRoomExitSurveyRows(rows: RoomExitSurveyAggregateRow[]): RoomExitSurveySummary {
	const summary = createEmptySummary();
	let overallTotal = 0;
	let sharedTotal = 0;
	let readabilityTotal = 0;
	let ratingCount = 0;
	const comments: RoomExitSurveyComment[] = [];

	for (const row of rows) {
		summary.response_count += 1;
		if (row.skipped) {
			summary.skipped_count += 1;
			continue;
		}

		summary.submitted_count += 1;
		if (row.overall_rating != null && row.shared_experience_rating != null && row.readability_rating != null) {
			overallTotal += row.overall_rating;
			sharedTotal += row.shared_experience_rating;
			readabilityTotal += row.readability_rating;
			ratingCount += 1;
		}
		if (row.next_participation) summary.next_participation_counts[row.next_participation] += 1;
		if (row.comparison_with_x) summary.comparison_with_x_counts[row.comparison_with_x] += 1;

		if (row.good_points || row.improvement_points) {
			comments.push({
				submitted_at: row.submitted_at,
				room_title: row.room_title ?? null,
				good_points: row.good_points,
				improvement_points: row.improvement_points,
				stayed_seconds: row.stayed_seconds,
				post_count: row.post_count,
			});
		}
	}

	summary.average_overall_rating = average(overallTotal, ratingCount);
	summary.average_shared_experience_rating = average(sharedTotal, ratingCount);
	summary.average_readability_rating = average(readabilityTotal, ratingCount);
	summary.comments = comments
		.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
		.slice(0, 20);
	return summary;
}
