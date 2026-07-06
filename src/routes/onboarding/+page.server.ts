import { fail, redirect } from "@sveltejs/kit";
import { completeProfileSetupAction } from "$lib/server/actions";
import { getProfileIdByUsername } from "$lib/server/queries";
import { sanitizeInternalRedirect } from "$lib/utils/url";
import type { Actions, PageServerLoad } from "./$types";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

function getSafeNext(raw: FormDataEntryValue | string | null): string {
	return sanitizeInternalRedirect(typeof raw === "string" ? raw : "/");
}

function getMetadataString(metadata: Record<string, unknown>, key: string): string | null {
	const value = metadata[key];
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getUsernameCandidate(value: string | null | undefined): string {
	const candidate = (value ?? "").trim().toLowerCase();
	return USERNAME_PATTERN.test(candidate) ? candidate : "";
}

function getOnboardingMetadata(user: NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"]>) {
	const metadata = user.user_metadata as Record<string, unknown>;
	const rawUsername = getMetadataString(metadata, "user_name") ?? user.email?.split("@")[0] ?? null;
	const displayName =
		getMetadataString(metadata, "full_name") ??
		getMetadataString(metadata, "name") ??
		getMetadataString(metadata, "user_name") ??
		"";
	const avatarUrl = getMetadataString(metadata, "avatar_url") ?? getMetadataString(metadata, "picture");

	return { rawUsername, displayName, avatarUrl };
}

async function getOnboardingDefaults(
	supabase: App.Locals["supabase"],
	user: NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"]>,
) {
	const metadata = getOnboardingMetadata(user);
	const usernameCandidate = getUsernameCandidate(metadata.rawUsername);
	if (!usernameCandidate) return { username: "", displayName: metadata.displayName, avatarUrl: metadata.avatarUrl };

	const existingProfileId = await getProfileIdByUsername(supabase, usernameCandidate);
	return {
		username: existingProfileId ? "" : usernameCandidate,
		displayName: metadata.displayName,
		avatarUrl: metadata.avatarUrl,
	};
}

export const load: PageServerLoad = async ({ parent, url, locals: { supabase } }) => {
	const { user, profile } = await parent();
	if (!user) redirect(303, "/auth");
	const next = getSafeNext(url.searchParams.get("next"));
	if (profile) redirect(303, next);

	const defaults = await getOnboardingDefaults(supabase, user);
	return {
		...defaults,
		next,
	};
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { username: "", display_name: "", message: "ログインが必要です" });

		const form = await request.formData();
		const next = getSafeNext(form.get("next"));
		const metadata = getOnboardingMetadata(user);
		const result = await completeProfileSetupAction(form, supabase, user.id, {
			oauthAvatarUrl: metadata.avatarUrl,
		});
		if ("error" in result) {
			return fail(result.status, {
				...result.values,
				...(result.field ? { field: result.field } : {}),
				message: result.error,
			});
		}

		redirect(303, next);
	},
};
