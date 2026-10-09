/**
 * 遷移中にページ全体を遷移先のスケルトンへ差し替えるかどうか（#292）。
 *
 * layout はこの戻り値（遷移先の pathname）が非 null の間、ページコンポーネントを
 * RouteNavigationSkeleton に置き換える。置き換えるとページはアンマウントされ、
 * 入力欄・フォーカス・開いているドロワーなどの状態がすべて失われる。
 *
 * そのため差し替えるのは「別のページへ移る」遷移だけにする。
 * - フォーム送信（type === "form"）は対象外（送信結果は同じページに出る）
 * - pathname が同じでクエリだけが変わる遷移（検索語・フィルター・タブ・ページ番号）は対象外。
 *   ページを残し、各ページが自前の読み込み表示で再取得を示す
 */
type NavigationTarget = { url: URL } | null | undefined;

export type NavigationLike =
	| {
			type?: string | null;
			from?: NavigationTarget;
			to?: NavigationTarget;
	  }
	| null
	| undefined;

export function navigationSkeletonPath(navigation: NavigationLike): string | null {
	if (!navigation || navigation.type === "form") return null;
	const to = navigation.to?.url;
	if (!to) return null;
	const from = navigation.from?.url;
	if (from && from.pathname === to.pathname) return null;
	return to.pathname;
}

/** 同じページのままクエリだけを変えて再取得している最中か（ページ側の軽い読み込み表示用） */
export function isSamePageRefresh(navigation: NavigationLike, pathname: string): boolean {
	if (!navigation?.type) return false;
	return navigation.from?.url.pathname === pathname && navigation.to?.url.pathname === pathname;
}
