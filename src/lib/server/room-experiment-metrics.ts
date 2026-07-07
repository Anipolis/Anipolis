export const ROOM_EXPERIMENT_HEARTBEAT_INTERVAL_MS = 30_000;
export const ROOM_EXPERIMENT_STALE_AFTER_MS = 90_000;
export const ROOM_EXPERIMENT_BOUNCE_SECONDS = 60;
export const ROOM_EXPERIMENT_HEARTBEAT_INTERVAL_SECONDS = ROOM_EXPERIMENT_HEARTBEAT_INTERVAL_MS / 1000;

export type ExperimentVisitInput = {
	user_id: string;
	entered_at: string;
	last_seen_at: string;
	exited_at: string | null;
	// 実アクティブ秒数の見積もりに使う。未指定なら滞在時間に上限をかけない(従来動作)。
	heartbeat_count?: number;
};

export type ExperimentPostCandidate = {
	id: string;
	user_id: string;
	broadcast_room_session_id: string | null;
	created_at: string;
	parent_id: string | null;
	hidden_by_admin: boolean | null;
};

export type ExperimentPostInput = {
	user_id: string;
	created_at: string;
};

export type ExperimentRoomInput = {
	broadcast_room_session_id: string;
	room_title: string | null;
	episode_number?: number | null;
	scheduled_at: string | null;
	posting_closes_at: string | null;
	visits: ExperimentVisitInput[];
	posts: ExperimentPostInput[];
};

export type ExperimentRunInput = {
	id: string;
	started_at: string;
	ended_at: string | null;
	rooms: ExperimentRoomInput[];
};

export type ExperimentRoomMetric = {
	broadcast_room_session_id: string;
	room_title: string | null;
	episode_number: number | null;
	scheduled_at: string | null;
	posting_closes_at: string | null;
	visit_count: number;
	unique_visitor_count: number;
	active_visit_count: number;
	post_count: number;
	poster_count: number;
	posting_rate: number;
	posts_per_poster: number;
	posts_per_unique_visitor: number;
	average_stay_seconds: number | null;
	bounce_rate_under_60s: number | null;
	early_exit_rate: number | null;
};

export type ExperimentSummaryMetric = Omit<
	ExperimentRoomMetric,
	"broadcast_room_session_id" | "room_title" | "episode_number" | "scheduled_at" | "posting_closes_at"
>;

export type ExperimentCalculatedMetrics = {
	rooms: ExperimentRoomMetric[];
	summary: ExperimentSummaryMetric;
};

function toMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const ms = new Date(value).getTime();
	return Number.isFinite(ms) ? ms : null;
}

function ratio(numerator: number, denominator: number): number {
	if (denominator <= 0) return 0;
	return numerator / denominator;
}

function boundedEndMs(visit: ExperimentVisitInput, runEndedMs: number | null, postingClosesMs: number | null) {
	const seenEndMs = toMs(visit.exited_at) ?? toMs(visit.last_seen_at) ?? toMs(visit.entered_at) ?? 0;
	return Math.min(
		seenEndMs,
		...(runEndedMs == null ? [] : [runEndedMs]),
		...(postingClosesMs == null ? [] : [postingClosesMs]),
	);
}

function isVisitActive(visit: ExperimentVisitInput, nowMs: number, runEndedMs: number | null, staleAfterMs: number) {
	if (runEndedMs != null) return false;
	if (visit.exited_at) return false;
	const lastSeenMs = toMs(visit.last_seen_at);
	return lastSeenMs != null && lastSeenMs >= nowMs - staleAfterMs;
}

function isStayEligible(visit: ExperimentVisitInput, postingClosesMs: number | null) {
	const enteredMs = toMs(visit.entered_at);
	if (enteredMs == null) return false;
	return postingClosesMs == null || enteredMs < postingClosesMs;
}

function visitStaySeconds(visit: ExperimentVisitInput, runEndedMs: number | null, postingClosesMs: number | null) {
	const enteredMs = toMs(visit.entered_at);
	if (enteredMs == null) return null;
	if (!isStayEligible(visit, postingClosesMs)) return null;
	const endMs = boundedEndMs(visit, runEndedMs, postingClosesMs);
	const spanSeconds = Math.max(0, Math.floor((endMs - enteredMs) / 1000));
	// 一時離席→再入場では entered→last_seen のスパンに離席時間が混ざる。
	// ハートビートは離席中は止まり再入場(upsert)でも増えないため、その回数から
	// 見積もった実アクティブ秒数を上限にして離席分を除外する。
	// (heartbeat_count + 1) で最後のハートビート以降の端数区間まで含める。
	// 離席が無い通常の訪問では上限がスパン以上になり、従来どおりスパン値になる。
	if (visit.heartbeat_count == null) return spanSeconds;
	const activeCapSeconds = (visit.heartbeat_count + 1) * ROOM_EXPERIMENT_HEARTBEAT_INTERVAL_SECONDS;
	return Math.min(spanSeconds, activeCapSeconds);
}

function calculateVisitStats(
	visits: ExperimentVisitInput[],
	runEndedMs: number | null,
	postingClosesMs: number | null,
	nowMs: number,
	staleAfterMs: number,
) {
	let stayTotal = 0;
	let stayCount = 0;
	let inactiveEligibleCount = 0;
	let bounceCount = 0;
	let earlyExitCount = 0;
	let activeCount = 0;

	for (const visit of visits) {
		const active = isVisitActive(visit, nowMs, runEndedMs, staleAfterMs);
		if (active) activeCount += 1;

		const staySeconds = visitStaySeconds(visit, runEndedMs, postingClosesMs);
		if (staySeconds != null) {
			stayTotal += staySeconds;
			stayCount += 1;
		}

		if (active || staySeconds == null) continue;
		inactiveEligibleCount += 1;
		if (staySeconds < ROOM_EXPERIMENT_BOUNCE_SECONDS) bounceCount += 1;

		if (postingClosesMs != null) {
			const endMs = boundedEndMs(visit, runEndedMs, null);
			if (endMs < postingClosesMs) earlyExitCount += 1;
		}
	}

	return {
		activeCount,
		averageStaySeconds: stayCount > 0 ? stayTotal / stayCount : null,
		bounceRate: inactiveEligibleCount > 0 ? bounceCount / inactiveEligibleCount : null,
		earlyExitRate:
			postingClosesMs == null || inactiveEligibleCount === 0 ? null : earlyExitCount / inactiveEligibleCount,
	};
}

function calculateAggregateVisitStats(
	rooms: ExperimentRoomInput[],
	runEndedMs: number | null,
	nowMs: number,
	staleAfterMs: number,
) {
	let stayTotal = 0;
	let stayCount = 0;
	let inactiveEligibleCount = 0;
	let bounceCount = 0;
	let earlyExitEligibleCount = 0;
	let earlyExitCount = 0;
	let activeCount = 0;

	for (const room of rooms) {
		const postingClosesMs = toMs(room.posting_closes_at);
		for (const visit of room.visits) {
			const active = isVisitActive(visit, nowMs, runEndedMs, staleAfterMs);
			if (active) activeCount += 1;

			const staySeconds = visitStaySeconds(visit, runEndedMs, postingClosesMs);
			if (staySeconds != null) {
				stayTotal += staySeconds;
				stayCount += 1;
			}

			if (active || staySeconds == null) continue;
			inactiveEligibleCount += 1;
			if (staySeconds < ROOM_EXPERIMENT_BOUNCE_SECONDS) bounceCount += 1;

			if (postingClosesMs != null) {
				earlyExitEligibleCount += 1;
				const endMs = boundedEndMs(visit, runEndedMs, null);
				if (endMs < postingClosesMs) earlyExitCount += 1;
			}
		}
	}

	return {
		activeCount,
		averageStaySeconds: stayCount > 0 ? stayTotal / stayCount : null,
		bounceRate: inactiveEligibleCount > 0 ? bounceCount / inactiveEligibleCount : null,
		earlyExitRate: earlyExitEligibleCount > 0 ? earlyExitCount / earlyExitEligibleCount : null,
	};
}

export function filterRoomExperimentPosts(
	posts: ExperimentPostCandidate[],
	options: {
		sessionId: string;
		runStartedAt: string;
		runEndedAt: string | null;
		postingClosesAt?: string | null;
	},
): ExperimentPostInput[] {
	const runStartedMs = toMs(options.runStartedAt);
	const runEndedMs = toMs(options.runEndedAt);
	const postingClosesMs = toMs(options.postingClosesAt);
	if (runStartedMs == null) return [];

	return posts
		.filter((post) => {
			if (post.broadcast_room_session_id !== options.sessionId) return false;
			if (post.parent_id !== null) return false;
			if (post.hidden_by_admin === true) return false;
			const createdMs = toMs(post.created_at);
			if (createdMs == null || createdMs < runStartedMs) return false;
			if (runEndedMs != null && createdMs >= runEndedMs) return false;
			if (postingClosesMs != null && createdMs >= postingClosesMs) return false;
			return true;
		})
		.map((post) => ({ user_id: post.user_id, created_at: post.created_at }));
}

function calculateRoomMetric(
	room: ExperimentRoomInput,
	runEndedMs: number | null,
	nowMs: number,
	staleAfterMs: number,
): ExperimentRoomMetric {
	const visitorIds = new Set(room.visits.map((visit) => visit.user_id));
	const posterIds = new Set(room.posts.map((post) => post.user_id));
	const postingClosesMs = toMs(room.posting_closes_at);
	const visitStats = calculateVisitStats(room.visits, runEndedMs, postingClosesMs, nowMs, staleAfterMs);

	return {
		broadcast_room_session_id: room.broadcast_room_session_id,
		room_title: room.room_title,
		episode_number: room.episode_number ?? null,
		scheduled_at: room.scheduled_at,
		posting_closes_at: room.posting_closes_at,
		visit_count: room.visits.length,
		unique_visitor_count: visitorIds.size,
		active_visit_count: visitStats.activeCount,
		post_count: room.posts.length,
		poster_count: posterIds.size,
		posting_rate: ratio(posterIds.size, visitorIds.size),
		posts_per_poster: ratio(room.posts.length, posterIds.size),
		posts_per_unique_visitor: ratio(room.posts.length, visitorIds.size),
		average_stay_seconds: visitStats.averageStaySeconds,
		bounce_rate_under_60s: visitStats.bounceRate,
		early_exit_rate: visitStats.earlyExitRate,
	};
}

export function calculateRoomExperimentMetrics(
	run: ExperimentRunInput,
	now = new Date(),
	staleAfterMs = ROOM_EXPERIMENT_STALE_AFTER_MS,
): ExperimentCalculatedMetrics {
	const nowMs = now.getTime();
	const runEndedMs = toMs(run.ended_at);
	const rooms = run.rooms.map((room) => calculateRoomMetric(room, runEndedMs, nowMs, staleAfterMs));

	const allVisits = run.rooms.flatMap((room) => room.visits);
	const allPosts = run.rooms.flatMap((room) => room.posts);
	const visitorIds = new Set(allVisits.map((visit) => visit.user_id));
	const posterIds = new Set(allPosts.map((post) => post.user_id));
	const summaryStats = calculateAggregateVisitStats(run.rooms, runEndedMs, nowMs, staleAfterMs);

	return {
		rooms,
		summary: {
			visit_count: allVisits.length,
			unique_visitor_count: visitorIds.size,
			active_visit_count: summaryStats.activeCount,
			post_count: allPosts.length,
			poster_count: posterIds.size,
			posting_rate: ratio(posterIds.size, visitorIds.size),
			posts_per_poster: ratio(allPosts.length, posterIds.size),
			posts_per_unique_visitor: ratio(allPosts.length, visitorIds.size),
			average_stay_seconds: summaryStats.averageStaySeconds,
			bounce_rate_under_60s: summaryStats.bounceRate,
			early_exit_rate: summaryStats.earlyExitRate,
		},
	};
}
