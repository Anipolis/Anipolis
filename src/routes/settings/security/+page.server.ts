import { error, fail, redirect } from "@sveltejs/kit";
import { getAssuranceLevel, isTotpCodeShape, normalizeTotpCode } from "$lib/server/mfa";
import { isAdminAccount } from "$lib/server/queries";
import { isRateLimited } from "$lib/server/rate-limit";
import { redirectToLogin } from "$lib/server/require-login";
import { sanitizeInternalRedirect } from "$lib/utils/url";
import type { Actions, PageServerLoad } from "./$types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 今は管理者だけが使う（管理者の権限は二段階認証を済ませたログインでだけ使える、migration 177）
export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);
	if (!(await isAdminAccount(supabase, user.id))) error(404, "Not Found");

	const [{ data: factors }, level] = await Promise.all([
		supabase.auth.mfa.listFactors(),
		getAssuranceLevel(supabase),
	]);
	const nextParam = url.searchParams.get("next");
	return {
		factors: (factors?.totp ?? []).map((factor) => ({ id: factor.id, createdAt: factor.created_at })),
		verifiedNow: level.current === "aal2",
		requiredForAdmin: url.searchParams.get("required") === "admin",
		next: nextParam ? sanitizeInternalRedirect(nextParam) : null,
	};
};

export const actions: Actions = {
	// 認証アプリに読み込ませる QR コードを出す。確認コードを入れるまで設定は有効にならない
	enroll: async ({ locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminAccount(supabase, user.id))) return fail(403, { message: "この設定は使えません" });

		const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
		if (listError) return fail(500, { message: "設定を読み込めませんでした" });
		if (factors.totp.length > 0) return fail(400, { message: "二段階認証はすでに設定されています" });
		// 途中でやめた設定（コード未確認）が残っていると、同じ名前で作り直せないので消してから作る
		for (const factor of factors.all.filter((item) => item.status === "unverified")) {
			await supabase.auth.mfa.unenroll({ factorId: factor.id });
		}

		const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Anipolis" });
		if (error || !data) return fail(500, { message: "二段階認証の準備に失敗しました。時間をおいてお試しください" });
		return { enrolled: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
	},

	// 認証アプリに出たコードで設定を有効にする（このログインもそのまま二段階認証済みになる）
	verify: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const factorId = (form.get("factor_id") as string | null) ?? "";
		const code = normalizeTotpCode(form.get("code"));
		if (!UUID_PATTERN.test(factorId))
			return fail(400, { message: "もう一度「設定をはじめる」からやり直してください" });
		if (!isTotpCodeShape(code)) {
			return fail(400, { message: "認証アプリに表示されている6桁の数字を入力してください" });
		}
		if (isRateLimited(`mfa-verify:${user.id}`, 10, 10 * 60_000)) {
			return fail(429, { message: "試行回数が多すぎます。しばらく待ってからお試しください" });
		}

		const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
		if (error)
			return fail(400, { message: "コードが正しくないか、有効期限が切れています。新しいコードでお試しください" });

		const next = form.get("next");
		if (typeof next === "string" && next) redirect(303, sanitizeInternalRedirect(next));
		return { verified: true };
	},

	// 設定を外す。Supabase が二段階認証済みのログイン（aal2）でしか外せないようにしている
	unenroll: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const factorId = (form.get("factor_id") as string | null) ?? "";
		if (!UUID_PATTERN.test(factorId)) return fail(400, { message: "外す設定が正しくありません" });

		const { error } = await supabase.auth.mfa.unenroll({ factorId });
		if (error)
			return fail(400, { message: "二段階認証を外せませんでした。もう一度ログインしてからお試しください" });
		return { removed: true };
	},
};
