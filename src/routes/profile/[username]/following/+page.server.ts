import { error } from "@sveltejs/kit";
import { type FollowListPage, getFollowCounts, getFollowListPage } from "#lib/server/queries.ts";
import { parseTimelineCursor } from "#lib/timeline-cursor.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const { data: profile } = await supabase
		.from("profiles")
		.select("id, username, display_name, avatar_url")
		.eq("username", params.username)
		.maybeSingle();

	if (!profile) {
		error(404, "ユーザーが見つかりません");
	}

	const followCounts = await getFollowCounts(supabase, profile.id);
	const cursor = parseTimelineCursor(url.searchParams);

	// 50人ずつ（#244）。取得の失敗を「まだいません」と見せない
	const listPromise: Promise<FollowListPage & { failed: boolean }> = getFollowListPage(
		supabase,
		"following",
		profile.id,
		user?.id ?? null,
		cursor,
	).then(
		(page) => ({ ...page, failed: false }),
		(err) => {
			console.error("[profile/following] error:", err);
			return { users: [], nextCursor: null, failed: true };
		},
	);

	return { profile, list: listPromise, followCounts, isContinuation: cursor != null, user };
};
