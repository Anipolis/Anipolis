import { json, type RequestHandler } from "@sveltejs/kit";
import { ensureAccountCanWrite } from "$lib/server/actions";

const reportReasons = new Set(["spam", "harassment", "sexual", "violence", "illegal", "other"]);
const reportTargetTypes = new Set(["post", "user"]);

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return json({ message: "ログインが必要です" }, { status: 401 });

	const moderationFailure = await ensureAccountCanWrite(supabase, user.id);
	if (moderationFailure) {
		const data = moderationFailure.data as { message?: string };
		return json({ message: data.message ?? "Account restricted" }, { status: moderationFailure.status });
	}

	const form = await request.formData();
	const targetType = (form.get("target_type") as string | null)?.trim() ?? "";
	const targetId = (form.get("target_id") as string | null)?.trim() ?? "";
	const reason = (form.get("reason") as string | null)?.trim() ?? "";
	const detailsRaw = (form.get("details") as string | null)?.trim() ?? "";
	const details = detailsRaw.length > 0 ? detailsRaw.slice(0, 500) : null;

	if (!reportTargetTypes.has(targetType)) return json({ message: "通報対象が不正です" }, { status: 400 });
	if (!targetId) return json({ message: "通報対象が不正です" }, { status: 400 });
	if (!reportReasons.has(reason)) return json({ message: "通報理由を選択してください" }, { status: 400 });

	let targetUserId: string | null = null;

	if (targetType === "post") {
		const { data: post } = await supabase.from("posts").select("user_id").eq("id", targetId).maybeSingle();
		if (!post) return json({ message: "投稿が見つかりません" }, { status: 404 });
		targetUserId = post.user_id;
	} else {
		const { data: profile } = await supabase.from("profiles").select("id").eq("id", targetId).maybeSingle();
		if (!profile) return json({ message: "ユーザーが見つかりません" }, { status: 404 });
		if (profile.id === user.id) return json({ message: "自分自身は通報できません" }, { status: 400 });
		targetUserId = profile.id;
	}

	const { error } = await supabase.from("reports").insert({
		reporter_id: user.id,
		target_type: targetType as "post" | "user",
		target_id: targetId,
		target_user_id: targetUserId,
		reason: reason as "spam" | "harassment" | "sexual" | "violence" | "illegal" | "other",
		details,
	});

	if (error) {
		if (error.code === "23505") {
			return json({ message: "この対象はすでに確認待ちです" }, { status: 409 });
		}
		console.error("report insert error:", error);
		return json({ message: "通報の送信に失敗しました" }, { status: 500 });
	}

	return json({ ok: true });
};
