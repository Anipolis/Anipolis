export function isHttpUrl(value: string | null | undefined): value is string {
	if (!value) return false;
	return value.startsWith("http://") || value.startsWith("https://");
}

export function isMalUrl(value: string | null | undefined): value is string {
	if (!value) return false;
	return value.includes("myanimelist.net") || value.includes("mal.");
}

/**
 * リダイレクト先として受け取った値をサイト内パスに限定する。
 * 外部 URL・プロトコル相対（//）・スキーム付き（:/）に加え、
 * ブラウザが / へ正規化するバックスラッシュ（`/\evil.com` → `//evil.com`）も拒否し、
 * 安全でない値は "/" にフォールバックする。
 */
export function sanitizeInternalRedirect(raw: string | null | undefined): string {
	if (!raw) return "/";
	return raw.startsWith("/") && !raw.startsWith("//") && !raw.includes(":/") && !raw.includes("\\") ? raw : "/";
}
