/**
 * 戻るボタンのルール:
 * - 入口が複数あるページ（投稿・作品・ハッシュタグなど）は直前のページへ戻る（BackLink）
 * - 直前のページがサイトの外（共有リンク・新しいタブ）なら、そのページの親へ移動する
 * - 入口が一つのページ（設定の各ページ・管理画面など）は常に親へ移動し、行き先を表記する
 */

let navigatedInApp = false;

/** ルートのレイアウトの afterNavigate から呼ぶ。アプリ内の遷移があったかを覚える（Navigation API が無いブラウザ用） */
export function recordNavigation(type: string): void {
	if (type !== "enter") navigatedInApp = true;
}

type NavigationLike = { currentEntry?: { index: number } | null };

/** 履歴を 1 つ戻ってもサイト内に留まれるか */
export function canGoBackInApp(): boolean {
	const navigation = (globalThis as { navigation?: NavigationLike }).navigation;
	// entries は同じオリジンで連続した履歴だけを数えるので、index が 1 以上なら直前もこのサイト
	if (navigation?.currentEntry) return navigation.currentEntry.index > 0;
	return navigatedInApp;
}
