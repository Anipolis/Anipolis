/** いいね・リポスト・ブックマークの操作種別 */
export type ReactionKind = "like" | "repost" | "bookmark";

/** SvelteKit の ActionResult のうち、失敗判定と文言生成に必要な部分 */
export type ReactionActionResult = {
	type: "success" | "failure" | "redirect" | "error";
	status?: number;
	data?: unknown;
};

const REACTION_LABELS: Record<ReactionKind, string> = {
	like: "いいね",
	repost: "リポスト",
	bookmark: "ブックマーク",
};

/** 楽観更新を巻き戻すべき結果か（失敗レスポンス・例外のどちらも含む） */
export function isReactionFailure(result: ReactionActionResult): boolean {
	return result.type === "failure" || result.type === "error";
}

function serverMessage(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const message = (data as { message?: unknown }).message;
	return typeof message === "string" && message.trim() ? message.trim() : null;
}

/**
 * 操作失敗時にカード内へ表示する理由文を返す。
 * サーバーがメッセージを返していればそれを優先し、無ければ操作種別ごとの汎用文にする。
 * 例外（通信断・500 など）はサーバー文言が得られないため通信エラーとして案内する。
 */
export function reactionFailureMessage(kind: ReactionKind, result: ReactionActionResult): string {
	const label = REACTION_LABELS[kind];
	if (result.type === "failure") {
		return serverMessage(result.data) ?? `${label}に失敗しました`;
	}
	return `通信エラーのため${label}を反映できませんでした`;
}
