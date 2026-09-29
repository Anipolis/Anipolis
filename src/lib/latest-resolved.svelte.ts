/**
 * ストリーミングで届く load の Promise を「最後に解決した値」として保持する（#100）。
 *
 * `{#await data.x}` は load が再実行されて新しい Promise になるたびに待機ブランチ
 * （スピナー・スケルトン）へ戻る。リアクション後の invalidate や「さらに読み込む」の
 * 遷移でも一覧が一瞬消えるのはこのため。ここでは新しい Promise が解決するまで前回の値を
 * 返し続け、スケルトンは初回（まだ何も解決していないとき）だけに限定する。
 *
 * コンポーネントの初期化中に呼ぶこと（内部で $effect を使う）。
 */
export type LatestResolved<T> = {
	/** 最後に解決した値。まだ一度も解決していなければ null */
	readonly value: T | null;
	/** 最新の Promise が失敗したときのエラー。次に成功したら消える */
	readonly error: unknown;
	/** 最新の Promise がまだ解決していない */
	readonly pending: boolean;
};

export function createLatestResolved<T>(getPromise: () => Promise<T> | T): LatestResolved<T> {
	let value = $state<T | null>(null);
	let error = $state<unknown>(null);
	let pending = $state(true);

	$effect(() => {
		const source = getPromise();
		let active = true;
		pending = true;
		Promise.resolve(source).then(
			(resolved) => {
				if (!active) return;
				value = resolved;
				error = null;
				pending = false;
			},
			(reason) => {
				if (!active) return;
				error = reason;
				pending = false;
			},
		);
		return () => {
			// 古い Promise の遅い解決で新しい値を巻き戻さない
			active = false;
		};
	});

	return {
		get value() {
			return value;
		},
		get error() {
			return error;
		},
		get pending() {
			return pending;
		},
	};
}
