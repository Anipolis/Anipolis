import { json } from "@sveltejs/kit";
import { getOpenBroadcastRoomSessions } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return json([], { status: 401 });
	const kindParam = url.searchParams.get("kind");
	const kind: "episode" | "global" | undefined =
		kindParam === "episode" || kindParam === "global" ? kindParam : undefined;
	return json(await getOpenBroadcastRoomSessions(supabase, kind ? { kind } : undefined));
};
