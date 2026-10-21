/** CW（ネタバレ注意）の判定に使う投稿の列。投稿・引用元・通知のどれからでも渡せるようにする */
export type ContentWarningFields = {
	cw_anime_id?: string | number | null;
	cw_anime?: { title: string } | null;
};

/**
 * CW が付いた投稿か。作品の JOIN が取れなくても ID があれば CW として扱い、安全側に倒す（#317）。
 * JOIN の欠落で通常の本文として表示されると、ネタバレがそのまま出てしまうため。
 */
export function hasContentWarning(post: ContentWarningFields): boolean {
	return post.cw_anime_id != null || post.cw_anime != null;
}

/** 警告文の頭に付ける対象作品（「『作品名』の」）。作品が分からなければ空 */
export function contentWarningSubject(post: ContentWarningFields): string {
	const title = post.cw_anime?.title?.trim();
	return title ? `『${title}』の` : "";
}

/** 引用枠・通知など、本文の代わりに出す警告ラベル */
export function contentWarningLabel(post: ContentWarningFields): string {
	return `${contentWarningSubject(post)}ネタバレを含む投稿`;
}
