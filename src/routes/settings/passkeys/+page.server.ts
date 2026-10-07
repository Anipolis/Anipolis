import { error, fail, redirect } from "@sveltejs/kit";
import { isPasskeyEnabled } from "$lib/server/passkey";
import type { Actions, PageServerLoad } from "./$types";

// passkeyId は Auth API の URL パスにそのまま埋め込まれるため、UUID 以外は弾く
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");
	if (!isPasskeyEnabled()) error(404, "Not Found");

	const { data, error: listError } = await supabase.auth.passkey.list();
	return { passkeys: data ?? [], loadFailed: listError !== null };
};

export const actions: Actions = {
	delete: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!isPasskeyEnabled()) return fail(404, { message: "パスキーは現在利用できません" });

		const form = await request.formData();
		const passkeyId = (form.get("passkey_id") as string | null) ?? "";
		if (!UUID_PATTERN.test(passkeyId)) return fail(400, { message: "削除するパスキーが正しくありません" });

		const { error: deleteError } = await supabase.auth.passkey.delete({ passkeyId });
		if (deleteError) return fail(500, { message: "パスキーの削除に失敗しました" });

		return { deleted: true };
	},
};
