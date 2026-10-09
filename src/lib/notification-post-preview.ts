import type { Notification } from "./types";

/** 通知に添える投稿プレビューの表示内容 */
export type NotificationPostPreview =
	/** 投稿へ移動できる。placeholder は本文が無く文脈ラベルを表示している状態 */
	| { kind: "link"; href: string; text: string; placeholder: boolean }
	/** 投稿行を取得できなかった（削除済み・非表示）ためリンクを出さない */
	| { kind: "deleted"; text: string }
	| null;

/** プレビューに載せる本文の最大文字数 */
export const NOTIFICATION_POST_PREVIEW_LENGTH = 80;

export const DELETED_POST_LABEL = "削除された投稿";

type NotificationPostFields = Pick<
	Notification,
	| "post_id"
	| "post_available"
	| "post_content"
	| "post_image_count"
	| "post_has_anime_quote"
	| "post_has_quoted_post"
	| "post_has_exchange_share"
>;

type NotificationPostAttachments = Omit<NotificationPostFields, "post_id" | "post_available" | "post_content">;

/** 本文を通知プレビュー用に切り詰める */
export function truncatePostContent(content: string, max = NOTIFICATION_POST_PREVIEW_LENGTH): string {
	const normalized = content.trim();
	if (normalized.length <= max) return normalized;
	return `${normalized.slice(0, max)}…`;
}

/**
 * 本文が空の投稿に添える文脈ラベルを組み立てる。
 * 画像・作品引用・トレード結果は組み合わせて「画像・作品引用の投稿」のように並べ、
 * 引用リポストのみの場合は「引用リポスト」とする。
 */
export function emptyPostContextLabel(post: NotificationPostAttachments): string {
	const parts: string[] = [];
	if (post.post_image_count > 0) {
		parts.push(post.post_image_count > 1 ? `画像${post.post_image_count}枚` : "画像");
	}
	if (post.post_has_anime_quote) parts.push("作品引用");
	if (post.post_has_exchange_share) parts.push("トレード結果");
	if (parts.length > 0) return `${parts.join("・")}の投稿`;
	if (post.post_has_quoted_post) return "引用リポスト";
	return "投稿を表示";
}

/**
 * 通知に表示する投稿プレビューを決める。
 * - post_id が無い通知（フォロー等）は何も出さない
 * - post_id はあるが投稿行を取得できない場合は「削除された投稿」としてリンクを出さない
 *   （削除済みのほか、管理者が非表示にした投稿も RLS で取得できずここに入る）
 * - 本文があればその抜粋、無ければ画像・作品引用などの文脈ラベルでリンクする
 */
export function notificationPostPreview(notif: NotificationPostFields): NotificationPostPreview {
	if (!notif.post_id) return null;
	if (!notif.post_available) return { kind: "deleted", text: DELETED_POST_LABEL };

	const href = `/posts/${notif.post_id}`;
	const content = truncatePostContent(notif.post_content);
	if (content) return { kind: "link", href, text: content, placeholder: false };
	return { kind: "link", href, text: emptyPostContextLabel(notif), placeholder: true };
}
