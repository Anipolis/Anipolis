import type { ActionResult } from "@sveltejs/kit";

export type ComposerSubmitOutcome = { kind: "success" } | { kind: "retry"; message: string } | { kind: "passthrough" };

const RETRY_HINT = "入力内容は残っているので、もう一度送信してください";
export const NETWORK_ERROR_MESSAGE = `通信エラーで投稿できませんでした。${RETRY_HINT}`;
export const FAILURE_FALLBACK_MESSAGE = `投稿に失敗しました。${RETRY_HINT}`;

/**
 * 投稿フォームの送信結果を「入力を消してよいか」で分類する。
 * success のときだけ入力を消し、failure（サーバー側の検証・権限エラー）と
 * error（通信障害・サーバー例外）では本文・画像・引用を保持して再送できるようにする（GitLab #1）。
 * redirect は SvelteKit の既定処理（update）に任せる。
 */
export function classifyComposerSubmitResult(result: ActionResult): ComposerSubmitOutcome {
	if (result.type === "success") return { kind: "success" };
	if (result.type === "failure") {
		const message = (result.data as { message?: string } | undefined)?.message;
		return { kind: "retry", message: message || FAILURE_FALLBACK_MESSAGE };
	}
	if (result.type === "error") return { kind: "retry", message: NETWORK_ERROR_MESSAGE };
	return { kind: "passthrough" };
}
