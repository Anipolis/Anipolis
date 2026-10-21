import { error } from "@sveltejs/kit";

/** 主要な中身を読めなかったときに画面に出す文言（#262） */
export const QUERY_FAILED_MESSAGE = "データを読み込めませんでした。時間をおいて再読み込みしてください";

/**
 * Supabase の取得の失敗を、空の結果（0 件・見つからない）と区別して扱う（#262）。
 * これまでは失敗を [] や null に置き換えていたので、障害が「まだありません」「見つかりません」と
 * 表示され、利用者はデータが消えたと誤解し、運用側もログに残らず気づけなかった。
 *
 * 失敗した処理の名前と、エラーのコード・メッセージだけを1行の JSON でログに残す（問い合わせの値や
 * キーは含めない）。そのうえで 503 を投げ、SvelteKit のエラー画面（ストリーミングの Promise なら
 * その失敗の表示）に任せる。補助の情報（サイドバーなど）は、呼び出し側で catch して空にしてよい。
 */
export function failQuery(context: string, cause: unknown): never {
	logQueryFailure(context, cause);
	error(503, QUERY_FAILED_MESSAGE);
}

/**
 * 失敗をログに残すだけ（画面は空のまま続ける）。サイドバーのランキング・近日のイベントなど、
 * 読めなくてもページを出したい補助の情報に使う。黙って [] にすると障害に気づけないため
 */
export function logQueryFailure(context: string, cause: unknown): void {
	const detail = cause as { code?: unknown; message?: unknown } | null | undefined;
	console.error(
		"[query_failed]",
		JSON.stringify({
			context,
			code: typeof detail?.code === "string" ? detail.code : null,
			message: typeof detail?.message === "string" ? detail.message.slice(0, 300) : null,
		}),
	);
}
