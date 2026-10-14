import { fail, redirect } from "@sveltejs/kit";
import { COPYRIGHT_REVIEW_KINDS, isCopyrightReviewKind } from "$lib/copyright-reviews";
import {
	approveCopyrightReviewsAsIsAction,
	COPYRIGHT_REVIEW_PAGE_SIZE,
	countPendingCopyrightReviews,
	getPendingCopyrightReviews,
	resolveCopyrightReviewAction,
} from "$lib/server/copyright-reviews";
import { isAdminUser } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	const isAdmin = await isAdminUser(supabase, user.id);
	if (!isAdmin) redirect(302, "/");

	const counts = await countPendingCopyrightReviews(supabase);
	const requestedKind = url.searchParams.get("kind");
	// 指定が無ければ、確認待ちが残っている最初の種類を開く
	const kind = isCopyrightReviewKind(requestedKind)
		? requestedKind
		: (COPYRIGHT_REVIEW_KINDS.find((candidate) => counts[candidate] > 0) ?? COPYRIGHT_REVIEW_KINDS[0]);
	const lastPage = Math.max(1, Math.ceil(counts[kind] / COPYRIGHT_REVIEW_PAGE_SIZE));
	const page = Math.min(lastPage, Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1));
	const items = await getPendingCopyrightReviews(supabase, kind, page);

	return { counts, kind, page, lastPage, items };
};

async function requireAdmin(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return { error: fail(401, { message: "ログインが必要です" }) } as const;
	if (!(await isAdminUser(locals.supabase, user.id))) {
		return { error: fail(403, { message: "管理者権限が必要です" }) } as const;
	}
	return { userId: user.id } as const;
}

export const actions: Actions = {
	resolve: async ({ request, locals }) => {
		const admin = await requireAdmin(locals);
		if ("error" in admin) return admin.error;
		return resolveCopyrightReviewAction(request, locals.supabase, admin.userId);
	},
	approveAsIs: async ({ request, locals }) => {
		const admin = await requireAdmin(locals);
		if ("error" in admin) return admin.error;
		return approveCopyrightReviewsAsIsAction(request, locals.supabase, admin.userId);
	},
};
