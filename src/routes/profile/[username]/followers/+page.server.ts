import { error } from "@sveltejs/kit";
import { getFollowCounts, getFollowerProfiles } from "$lib/server/queries";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
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

	const followersPromise = getFollowerProfiles(supabase, profile.id).catch((err) => {
		console.error("[profile/followers] error:", err);
		return [] as Awaited<ReturnType<typeof getFollowerProfiles>>;
	});

	return { profile, followers: followersPromise, followCounts, user };
};
