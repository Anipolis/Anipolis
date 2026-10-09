import { type ReactionActionResult, type ReactionKind, reactionFailureMessage } from "./reaction-feedback";

/** 表示したまま放置された失敗メッセージを自動で閉じるまでの時間 */
const DEFAULT_AUTO_CLEAR_MS = 8000;

/**
 * 再試行の手段。DOM に残っているフォームならそのまま再送し、送信と同時に破棄される
 * フォーム（リポストメニュー内のフォームなど）は呼び出し側が再送手順を関数で渡す。
 */
export type ReactionRetryTarget = HTMLFormElement | (() => void) | null;

/**
 * 投稿カード内に出すリアクション失敗メッセージの状態。
 * 直近に失敗した操作を覚えておき、「再試行」で同じ操作をもう一度送信できるようにする。
 */
export function createReactionFeedback(autoClearMs = DEFAULT_AUTO_CLEAR_MS) {
	let message = $state("");
	let lastRetry = $state<ReactionRetryTarget>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function clear() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		message = "";
		lastRetry = null;
	}

	/** 失敗結果からメッセージを組み立てて表示する（次の成功または一定時間で消える） */
	function fail(kind: ReactionKind, result: ReactionActionResult, retryTarget: ReactionRetryTarget = null) {
		clear();
		message = reactionFailureMessage(kind, result);
		// DOM から外れたフォームは requestSubmit しても送信されない（enhance のリスナーも解除済み）。
		// その場合は再試行を出さない
		lastRetry = retryTarget instanceof HTMLFormElement && !retryTarget.isConnected ? null : retryTarget;
		if (autoClearMs > 0) timer = setTimeout(clear, autoClearMs);
	}

	/** 直近に失敗した操作を再送信する */
	function retry() {
		const target = lastRetry;
		clear();
		if (typeof target === "function") target();
		else if (target?.isConnected) target.requestSubmit();
	}

	return {
		get message() {
			return message;
		},
		get canRetry() {
			return lastRetry !== null;
		},
		clear,
		fail,
		retry,
	};
}

export type ReactionFeedback = ReturnType<typeof createReactionFeedback>;
