/**
 * 入力に追随する検索の新旧を管理する（#329）。
 *
 * debounce のタイマーを止めるだけだと、既に送った検索の応答は止まらない。遅れて届いた古い応答が
 * 新しい結果を上書きしたり、閉じた候補を開き直したりするので、検索ごとに世代を振り、
 * 最新の検索の応答だけを反映する。新しい検索・閉じる操作では前の通信も中断する。
 */
export interface SearchGate {
	/** 新しい検索を始める。前の検索は中断され、その応答は isCurrent() が false になる */
	start(): { signal: AbortSignal; isCurrent: () => boolean };
	/** 進行中の検索を無効にする（閉じる・入力を空にする・選択を確定する・アンマウント） */
	cancel(): void;
}

export function createSearchGate(): SearchGate {
	let generation = 0;
	let controller: AbortController | null = null;
	return {
		start() {
			controller?.abort();
			const current = new AbortController();
			controller = current;
			const id = ++generation;
			return { signal: current.signal, isCurrent: () => id === generation && !current.signal.aborted };
		},
		cancel() {
			controller?.abort();
			controller = null;
			generation++;
		},
	};
}
