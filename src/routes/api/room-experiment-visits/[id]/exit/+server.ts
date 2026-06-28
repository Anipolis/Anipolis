import { error } from "@sveltejs/kit";
import { createRoomExperimentServiceClient, exitRoomExperimentVisit } from "$lib/server/room-experiments";
import type { RequestHandler } from "./$types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noContent() {
	return new Response(null, { status: 204 });
}

export const POST: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	if (!UUID_RE.test(params.id)) return noContent();

	const supabase = createRoomExperimentServiceClient();
	if (!supabase) return noContent();

	const result = await exitRoomExperimentVisit(supabase, user.id, params.id);
	if (!result.ok) error(result.status, result.message);
	return noContent();
};
