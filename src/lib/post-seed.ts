import type { Post } from "$lib/types";

/**
 * タイムラインなどで表示済みの投稿を、投稿詳細へ遷移する間だけ覚えておく。
 *
 * 詳細ページのスレッド（返信・親投稿を含む）はストリーミングで届くため、届くまでは
 * スケルトンになる。表示済みの本文は先に見せられるので、スレッドが届くまでの仮表示に使う。
 * 仮表示は閲覧者がすでに見ている内容だけで、スレッドが届いたらそちらに置き換わる。
 */
const MAX_SEEDS = 30;
const seeds = new Map<string, Post>();

export function rememberPostSeed(post: Post): void {
	// リポストの表示はタイムライン固有の文脈なので、詳細では持ち越さない
	seeds.delete(post.id);
	seeds.set(post.id, { ...post, repost_context: null });
	if (seeds.size > MAX_SEEDS) {
		const oldest = seeds.keys().next().value;
		if (oldest !== undefined) seeds.delete(oldest);
	}
}

export function recallPostSeed(id: string): Post | null {
	return seeds.get(id) ?? null;
}
