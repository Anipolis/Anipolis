import { error, json } from "@sveltejs/kit";
import { createRoomExperimentServiceClient, createRoomExperimentVisit } from "$lib/server/room-experiments";
import type { RequestHandler } from "./$types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noContent() {
	return new Response(null, { status: 204 });
}

async function readBody(
	request: Request,
): Promise<{ session_id?: unknown; event_id?: unknown; client_visit_key?: unknown }> {
	try {
		return (await request.json()) as { session_id?: unknown; event_id?: unknown; client_visit_key?: unknown };
	} catch {
		return {};
	}
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

	const body = await readBody(request);
	const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
	const eventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
	const clientVisitKey = typeof body.client_visit_key === "string" ? body.client_visit_key.trim() : "";

	const hasSessionId = UUID_RE.test(sessionId);
	const hasEventId = UUID_RE.test(eventId);
	// session_id と event_id はどちらか一方のみ指定される（放送回ルーム/イベントルームの排他ターゲット）。
	if (hasSessionId === hasEventId) return noContent();

	const supabase = createRoomExperimentServiceClient();
	if (!supabase) return noContent();

	const result = await createRoomExperimentVisit(supabase, user.id, {
		sessionId: hasSessionId ? sessionId : undefined,
		eventId: hasEventId ? eventId : undefined,
		clientVisitKey,
		userAgent: request.headers.get("user-agent"),
	});

	if ("error" in result) error(result.status, result.message);
	if (!result.tracked) return noContent();

	return json({
		visit_id: result.visitId,
		heartbeat_interval_ms: result.heartbeatIntervalMs,
		stale_after_ms: result.staleAfterMs,
	});
};
