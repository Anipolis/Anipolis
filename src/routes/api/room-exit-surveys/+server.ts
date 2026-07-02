import { error, json } from "@sveltejs/kit";
import { parseRoomExitSurveyRequest, saveRoomExitSurveyResponse } from "$lib/server/room-exit-survey";
import { createRoomExperimentServiceClient } from "$lib/server/room-experiments";
import type { RequestHandler } from "./$types";

async function readBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

	const parsed = parseRoomExitSurveyRequest(await readBody(request));
	if (!parsed.ok) error(parsed.status, parsed.message);

	const validator = createRoomExperimentServiceClient();
	if (!validator) error(503, "Survey validation is unavailable");

	const result = await saveRoomExitSurveyResponse(supabase, validator, user.id, parsed.value);
	if (!result.ok) error(result.status, result.message);

	return json({ ok: true, duplicate: result.duplicate === true });
};
