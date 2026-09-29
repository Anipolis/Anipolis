/**
 * 編集をまとめてから 1 回だけ反映する（アニメ一覧のフィルター → URL 反映に使う、#292）。
 *
 * - schedule を連続で呼ぶと最後の値だけを、最後の呼び出しから delayMs 後に commit する
 * - replace は保留中の呼び出しのどれか 1 つでも true なら true（文字入力を含む編集は履歴を置き換える）
 * - commit を呼ぶ直前に保留状態を解除する。commit の中で始まる遷移（beforeNavigate）から
 *   見ると「保留なし」になるので、自分の反映を自分で取り消さない
 * - cancel は保留中の反映を捨てる。別ページへの遷移やページ破棄のときに呼び、
 *   離脱後にタイマーが発火して元のページへ引き戻すのを防ぐ
 */
export type DebouncedCommit<T> = {
	schedule(value: T, delayMs: number, replace?: boolean): void;
	cancel(): void;
	readonly pending: boolean;
};

export function createDebouncedCommit<T>(commit: (value: T, replace: boolean) => void): DebouncedCommit<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending = false;
	let replace = false;
	let latest: T;

	function cancel() {
		clearTimeout(timer);
		timer = undefined;
		pending = false;
		replace = false;
	}

	return {
		schedule(value, delayMs, replaceHistory = false) {
			latest = value;
			pending = true;
			replace = replace || replaceHistory;
			clearTimeout(timer);
			timer = setTimeout(() => {
				const value = latest;
				const shouldReplace = replace;
				timer = undefined;
				pending = false;
				replace = false;
				commit(value, shouldReplace);
			}, delayMs);
		},
		cancel,
		get pending() {
			return pending;
		},
	};
}
