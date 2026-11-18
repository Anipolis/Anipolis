/**
 * テスト用: supabase.rpc() の偽物を、`.order()`・`.range()` を挟んでも await で結果を返す形にする。
 * 本物の rpc() はクエリビルダーを返すので、全件をページで読む呼び出し（fetchAllPages）が order/range を続けて呼ぶ（#558）
 */
export function chainableRpc<Args extends unknown[], Result>(fn: (...args: Args) => Result | Promise<Result>) {
	return (...args: Args) => {
		const result = Promise.resolve().then(() => fn(...args)) as Promise<Result> &
			Record<"order" | "range", (...rest: unknown[]) => unknown>;
		result.order = () => result;
		result.range = () => result;
		return result;
	};
}
