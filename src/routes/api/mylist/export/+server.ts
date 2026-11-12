import { json } from "@sveltejs/kit";
import { toMalXml, toMylistCsv } from "$lib/mylist-transfer";
import { getMylistForExport } from "$lib/server/queries";
import { jstDateKey } from "$lib/utils/jst";
import type { RequestHandler } from "./$types";

// マイリストの書き出し（#358）。format=mal は MyAnimeList の取り込み形式（XML）、format=csv は Anipolis の CSV。
// データを人質に取らないため、本人ならいつでも全部持ち出せる。
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return json({ message: "ログインが必要です" }, { status: 401 });
	const format = url.searchParams.get("format") === "csv" ? "csv" : "mal";

	const [entries, profile] = await Promise.all([
		getMylistForExport(supabase, user.id),
		supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
	]);
	const username = profile.data?.username ?? "anipolis";
	const date = jstDateKey(new Date());
	const body = format === "csv" ? toMylistCsv(entries) : toMalXml(entries, username);
	const filename = `anipolis-mylist-${username}-${date}.${format === "csv" ? "csv" : "xml"}`;
	return new Response(body, {
		headers: {
			"content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/xml; charset=utf-8",
			"content-disposition": `attachment; filename="${filename}"`,
			"cache-control": "private, no-store",
		},
	});
};
