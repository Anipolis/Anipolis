/**
 * 投稿フォームの @メンション候補に関する純粋ロジック（GitLab #4）。
 * テキスト操作とキーボード操作の解決を UI から切り離し、単体テストできるようにする。
 */

/** カーソル直前の「@ユーザー名（入力途中）」にマッチするパターン */
const MENTION_QUERY_PATTERN = /@([a-zA-Z0-9_]*)$/;

/**
 * カーソル位置より前の本文から、入力途中のメンション検索語を取り出す。
 * `@` が直前にない場合は null。`@` 直後（検索語が空）は空文字を返す。
 */
export function findMentionQuery(text: string, cursor: number): string | null {
	const match = text.slice(0, cursor).match(MENTION_QUERY_PATTERN);
	return match ? (match[1] ?? "") : null;
}

/**
 * 入力途中のメンションを確定したユーザー名で置き換え、置換後の本文とカーソル位置を返す。
 * 確定後は続けて入力できるよう、ユーザー名の後ろに半角スペースを 1 つ挟む。
 */
export function applyMention(text: string, cursor: number, username: string): { text: string; cursor: number } {
	const before = text.slice(0, cursor).replace(MENTION_QUERY_PATTERN, `@${username} `);
	return { text: before + text.slice(cursor), cursor: before.length };
}

/** 候補リストの中で選択中の index を上下に動かす。端では反対側へ折り返す。 */
export function moveActiveIndex(current: number, count: number, delta: 1 | -1): number {
	if (count <= 0) return -1;
	const base = current < 0 || current >= count ? (delta > 0 ? -1 : count) : current;
	return (base + delta + count) % count;
}

export type MentionKeyAction =
	| { type: "move"; index: number }
	| { type: "select"; index: number }
	| { type: "close" }
	| { type: "none" };

export interface MentionKeyContext {
	open: boolean;
	count: number;
	activeIndex: number;
	/** IME 変換中（KeyboardEvent.isComposing または keyCode 229）かどうか */
	composing: boolean;
}

/**
 * textarea 上のキー入力を候補リストへの操作に解決する。
 * - 候補が閉じている / IME 変換中は何もしない（変換確定の Enter を横取りしない）
 * - ↑↓ で移動、Enter / Tab で確定、Escape で閉じる
 */
export function resolveMentionKey(key: string, ctx: MentionKeyContext): MentionKeyAction {
	if (!ctx.open || ctx.count === 0 || ctx.composing) return { type: "none" };
	switch (key) {
		case "ArrowDown":
			return { type: "move", index: moveActiveIndex(ctx.activeIndex, ctx.count, 1) };
		case "ArrowUp":
			return { type: "move", index: moveActiveIndex(ctx.activeIndex, ctx.count, -1) };
		case "Enter":
		case "Tab": {
			const index = ctx.activeIndex >= 0 && ctx.activeIndex < ctx.count ? ctx.activeIndex : 0;
			return { type: "select", index };
		}
		case "Escape":
			return { type: "close" };
		default:
			return { type: "none" };
	}
}

/** aria-activedescendant 用に候補 option の id を組み立てる */
export function mentionOptionId(listId: string, index: number): string {
	return `${listId}-option-${index}`;
}
