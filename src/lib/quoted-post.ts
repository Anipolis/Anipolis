import { emptyPostContextLabel } from "./notification-post-preview";
import type { QuotedPost } from "./types";

type QuotedPostSummaryFields = Pick<QuotedPost, "content" | "image_urls" | "anime_id" | "anime" | "quoted_post_id">;

/**
 * 引用枠に本文も画像も作品名も出せないときに、代わりに出すラベル（#290）。
 * 通知のプレビュー（#279）と同じ言い方にそろえる（「作品引用の投稿」「引用リポスト」「投稿を表示」）。
 * 縮小画像や作品名が見えていれば、それで何の投稿か分かるのでラベルは出さない（null）
 */
export function quotedPostPlaceholder(quoted: QuotedPostSummaryFields): string | null {
	if (quoted.content.trim() || quoted.image_urls.length > 0 || quoted.anime != null) return null;
	return emptyPostContextLabel({
		post_image_count: quoted.image_urls.length,
		post_has_anime_quote: quoted.anime_id != null || quoted.anime != null,
		post_has_quoted_post: quoted.quoted_post_id != null,
		post_has_exchange_share: false,
	});
}
