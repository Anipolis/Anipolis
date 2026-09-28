import { type ReactionActionResult, type ReactionKind, reactionFailureMessage } from "./reaction-feedback";

/** 表示したまま放置された失敗メッセージを自動で閉じるまでの時間 */
const DEFAULT_AUTO_CLEAR_MS = 8000;

/**
 * 投稿カード内に出すリアクション失敗メッセージの状態。
 * 直近に失敗したフォームを覚えておき、「再試行」で同じ操作をもう一度送信できるようにする。
 */
export function createReactionFeedback(autoClearMs = DEFAULT_AUTO_CLEAR_MS) {
	let message = $state("");
	let lastForm = $state<HTMLFormElement | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function clear() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		message = "";
		lastForm = null;
	}

	/** 失敗結果からメッセージを組み立てて表示する（次の成功または一定時間で消える） */
	function fail(kind: ReactionKind, result: ReactionActionResult, form: HTMLFormElement | null = null) {
		clear();
		message = reactionFailureMessage(kind, result);
		lastForm = form;
		if (autoClearMs > 0) timer = setTimeout(clear, autoClearMs);
	}

	/** 直近に失敗した操作を再送信する */
	function retry() {
		const form = lastForm;
		clear();
		form?.requestSubmit();
	}

	return {
		get message() {
			return message;
		},
		get canRetry() {
			return lastForm !== null;
		},
		clear,
		fail,
		retry,
	};
}

export type ReactionFeedback = ReturnType<typeof createReactionFeedback>;
