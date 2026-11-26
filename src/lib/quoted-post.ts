import { emptyPostContextLabel } from "./notification-post-preview";
import type { QuotedPost } from "./types";

type QuotedPostSummaryFields = Pick<QuotedPost, "content" | "image_urls" | "anime_id" | "anime" | "quoted_post_id">;

/**
 * 本文の無い引用元に、引用枠で本文の代わりに出すラベル（#290）。本文があれば null。
 * 通知のプレビュー（#279）と同じ言い方にそろえる（「画像2枚の投稿」「作品引用の投稿」「引用リポスト」）。
 * 画像だけ・作品引用だけの投稿を引用したときに、引用枠が空に見えないようにする
 */
export function quotedPostPlaceholder(quoted: QuotedPostSummaryFields): string | null {
	if (quoted.content.trim()) return null;
	return emptyPostContextLabel({
		post_image_count: quoted.image_urls.length,
		post_has_anime_quote: quoted.anime_id != null || quoted.anime != null,
		post_has_quoted_post: quoted.quoted_post_id != null,
		post_has_exchange_share: false,
	});
}
