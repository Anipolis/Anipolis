import { fail, redirect } from "@sveltejs/kit";
import { getAssuranceLevel, isTotpCodeShape, needsMfaChallenge, normalizeTotpCode } from "$lib/server/mfa";
import { isRateLimited } from "$lib/server/rate-limit";
import { sanitizeInternalRedirect } from "$lib/utils/url";
import type { Actions, PageServerLoad } from "./$types";

function getSafeNext(raw: FormDataEntryValue | string | null): string {
	return sanitizeInternalRedirect(typeof raw === "string" ? raw : "/");
}

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/auth");
	const next = getSafeNext(url.searchParams.get("next"));
	// 二段階認証を設定していない・もう済ませたときは、行きたかった画面へ
	if (!needsMfaChallenge(await getAssuranceLevel(supabase))) redirect(303, next);
	return { next };
};

export const actions: Actions = {
	verify: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) redirect(303, "/auth");

		const form = await request.formData();
		const next = getSafeNext(form.get("next"));
		const code = normalizeTotpCode(form.get("code"));
		if (!isTotpCodeShape(code)) {
			return fail(400, { message: "認証アプリに表示されている6桁の数字を入力してください" });
		}
		// コードの総当たり対策（アカウント単位）
		if (isRateLimited(`mfa-verify:${user.id}`, 10, 10 * 60_000)) {
			return fail(429, { message: "試行回数が多すぎます。しばらく待ってからお試しください" });
		}

		const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
		const factor = factors?.totp[0];
		if (listError || !factor) {
			return fail(500, { message: "二段階認証の設定を読み込めませんでした。もう一度ログインしてください" });
		}

		const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
		if (error) {
			return fail(400, { message: "コードが正しくないか、有効期限が切れています。新しいコードでお試しください" });
		}

		redirect(303, next);
	},

	logout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, "/auth");
	},
};
