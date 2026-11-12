/**
 * 戻るボタンのルール:
 * - 入口が複数あるページ（投稿・作品・ハッシュタグなど）は直前のページへ戻る（BackLink）
 * - 直前のページがサイトの外（共有リンク・新しいタブ）なら、そのページの親へ移動する
 * - 入口が一つのページ（設定の各ページ・管理画面など）は常に親へ移動し、行き先を表記する
 */

/** SvelteKit が history.state に入れる履歴の通し番号（同じ文書の中で 1 ずつ増え、置き換えでは変わらない） */
const HISTORY_INDEX_KEY = "sveltekit:history";

let entryHistoryIndex: number | null = null;

function currentHistoryIndex(): number | null {
	const index = (history.state as Record<string, unknown> | null)?.[HISTORY_INDEX_KEY];
	return typeof index === "number" ? index : null;
}

/** ルートのレイアウトの afterNavigate から呼ぶ。読み込んだ時点の履歴の位置を覚える（Navigation API が無いブラウザ用） */
export function recordNavigation(type: string): void {
	if (type === "enter") entryHistoryIndex = currentHistoryIndex();
}

type NavigationLike = { currentEntry?: { index: number } | null };

/** 履歴を 1 つ戻ってもサイト内に留まれるか */
export function canGoBackInApp(): boolean {
	const navigation = (globalThis as { navigation?: NavigationLike }).navigation;
	// entries は同じオリジンで連続した履歴だけを数えるので、index が 1 以上なら直前もこのサイト
	if (navigation?.currentEntry) return navigation.currentEntry.index > 0;
	// 読み込んだ位置より先にいるときだけ戻れる（読み込んだページへ履歴で戻ったら親へ送る）
	const current = currentHistoryIndex();
	return entryHistoryIndex !== null && current !== null && current > entryHistoryIndex;
}
