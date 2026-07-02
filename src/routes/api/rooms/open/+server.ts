import { json } from "@sveltejs/kit";
import { getOpenBroadcastRoomSessions } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return json([], { status: 401 });
	return json(await getOpenBroadcastRoomSessions(supabase));
};
