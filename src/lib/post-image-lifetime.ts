/**
 * 投稿していない画像の使用期限（#330）。
 *
 * 画像は投稿欄で選んだ時点で post-images に保存される。投稿されずに残った画像は回収するが、
 * 下書きは編集するたびに保存し直されて期限が延びるので、「下書きの期限を過ぎた画像なら使われない」とは
 * 言えない。そこで画像そのものに「アップロードから7日まで使える」という期限を持たせる。
 *   * 下書きを復元するとき、期限切れの画像は外す（compose-draft）
 *   * 投稿するとき、期限切れの画像は受け付けない（insertPostWithHashtags）
 *   * 回収はそれより1日長い8日を過ぎ、どの投稿にも使われていない画像だけ（scripts/sweep-orphan-post-images）
 * アップロード時刻は、サーバーが付けるファイル名（<user_id>/<Date.now()>-<uuid>.<拡張子>）から読む。
 * scripts/ からも使うので $lib の別名は使わない。
 */
export const POST_IMAGE_UNPOSTED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 回収はこの期間を過ぎたものだけ。使用期限より長くして、期限ぎりぎりの投稿と競合しないようにする */
export const POST_IMAGE_SWEEP_AFTER_MS = POST_IMAGE_UNPOSTED_TTL_MS + 24 * 60 * 60 * 1000;

const UPLOADED_AT_PATTERN = /\/(\d{13})-[0-9a-f-]{36}\.[a-z0-9]+(?:\?.*)?$/i;

/** 画像の URL（またはパス）からアップロード時刻を読む。読めなければ null（旧形式・手で置いたもの） */
export function postImageUploadedAt(urlOrPath: string): number | null {
	const match = urlOrPath.match(UPLOADED_AT_PATTERN);
	if (!match?.[1]) return null;
	const uploadedAt = Number(match[1]);
	return Number.isFinite(uploadedAt) ? uploadedAt : null;
}

/** まだ投稿に使えるか。アップロード時刻が読めない画像は期限を判断できないので使える扱いにする */
export function isPostImageUsable(urlOrPath: string, now = Date.now()): boolean {
	const uploadedAt = postImageUploadedAt(urlOrPath);
	return uploadedAt === null || now - uploadedAt <= POST_IMAGE_UNPOSTED_TTL_MS;
}

/**
 * 回収してよい画像か。どの投稿にも使われておらず、使用期限より長い POST_IMAGE_SWEEP_AFTER_MS を過ぎたもの。
 * アップロード時刻はファイル名（使用期限の判定と同じ値）を優先し、読めなければ Storage の作成日時を使う。
 */
export function shouldSweepPostImage(
	path: string,
	storageCreatedAt: number,
	referencedPaths: ReadonlySet<string>,
	now = Date.now(),
): boolean {
	if (referencedPaths.has(path)) return false;
	const uploadedAt = postImageUploadedAt(path) ?? storageCreatedAt;
	return now - uploadedAt > POST_IMAGE_SWEEP_AFTER_MS;
}
