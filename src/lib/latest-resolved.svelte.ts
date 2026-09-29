/**
 * ストリーミングで届く load の Promise を「最後に解決した値」として保持する（#100）。
 *
 * `{#await data.x}` は load が再実行されて新しい Promise になるたびに待機ブランチ
 * （スピナー・スケルトン）へ戻る。リアクション後の invalidate や「さらに読み込む」の
 * 遷移でも一覧が一瞬消えるのはこのため。ここでは新しい Promise が解決するまで前回の値を
 * 返し続け、スケルトンは初回（まだ何も解決していないとき）だけに限定する。
 *
 * SSR では $effect が走らないため、getPromise が Promise ではなく値そのものを返した場合は
 * 初期化時に同期的に取り込む（ストリーミング中の Promise はサーバー HTML でも待機表示になる。
 * これは 2026-05 のストリーミング化以来の仕様）。
 *
 * getKey を渡すと、その値が変わったとき（タブ切替・別ハッシュタグ・別ページなど一覧の
 * 識別子が変わったとき）は前回の値を捨てて待機表示に戻す。同じ一覧の再取得だけを保持する。
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

function isThenable<T>(source: Promise<T> | T): source is Promise<T> {
	return typeof (source as { then?: unknown } | null)?.then === "function";
}

export function createLatestResolved<T>(
	getPromise: () => Promise<T> | T,
	getKey: () => string = () => "",
): LatestResolved<T> {
	const initial = getPromise();
	const initialSync = !isThenable(initial);
	let value = $state<T | null>(initialSync ? initial : null);
	let error = $state<unknown>(null);
	let pending = $state(!initialSync);
	let lastKey: string | null = null;

	$effect(() => {
		const source = getPromise();
		const key = getKey();
		let active = true;
		if (lastKey !== null && key !== lastKey) {
			// 別の一覧に切り替わった: 前回の一覧を見せ続けると誤解を招くので捨てる
			value = null;
			error = null;
		}
		lastKey = key;
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
