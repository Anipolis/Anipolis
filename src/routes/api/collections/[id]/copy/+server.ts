import { error, json } from "@sveltejs/kit";
import { isCollectionId, MAX_COLLECTIONS_PER_USER } from "$lib/collections";
import { requireAccountCanWrite } from "$lib/server/actions";
import type { RequestHandler } from "./$types";

// 他の人のコレクションを取り込む（自分のコレクションとして写す。194）。写したものは非公開で始まる
export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	if (!isCollectionId(params.id)) error(404, "コレクションが見つかりません");
	await requireAccountCanWrite(supabase, user.id);

	const { data, error: rpcError } = await supabase.rpc("copy_collection", { p_source_id: params.id });
	if (rpcError || typeof data !== "string") {
		console.error("copy_collection error:", rpcError);
		if (rpcError?.code === "P0002") error(404, "コレクションが見つかりません");
		if (rpcError?.message.includes("too many collections")) {
			error(
				400,
				`コレクションは${MAX_COLLECTIONS_PER_USER}個までです。いらないものを消してから取り込んでください`,
			);
		}
		if (rpcError?.code === "22023") error(400, "このコレクションは取り込めません");
		error(500, "取り込みに失敗しました");
	}
	return json({ id: data });
};
