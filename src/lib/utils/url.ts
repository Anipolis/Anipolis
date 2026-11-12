export function isHttpUrl(value: string | null | undefined): value is string {
	if (!value) return false;
	return value.startsWith("http://") || value.startsWith("https://");
}

export function isMalUrl(value: string | null | undefined): value is string {
	if (!value) return false;
	return value.includes("myanimelist.net") || value.includes("mal.");
}

const REDIRECT_BASE = "https://internal.invalid";

/** TAB・改行などの制御文字（U+0000〜U+001F と U+007F）を含むか */
function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 0x1f || code === 0x7f) return true;
	}
	return false;
}

/**
 * リダイレクト先として受け取った値をサイト内パスに限定する。
 * 外部 URL・プロトコル相対（//）・スキーム付き（:/）に加え、
 * ブラウザが / へ正規化するバックスラッシュ（`/\evil.com` → `//evil.com`）も拒否し、
 * 安全でない値は "/" にフォールバックする。
 *
 * URL パーサーは TAB と改行を捨てるので、`/<TAB>/evil.com` は `//evil.com` と同じに読まれる。
 * 制御文字を含む値を拒否し、最後に URL パーサーの解釈でも同じ origin に留まることを確かめる
 * （文字列の検査をすり抜ける書き方が残っていても、外部には出さない）。
 */
export function sanitizeInternalRedirect(raw: string | null | undefined): string {
	if (!raw) return "/";
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes(":/") || raw.includes("\\")) return "/";
	if (hasControlCharacter(raw)) return "/";
	try {
		if (new URL(raw, REDIRECT_BASE).origin !== REDIRECT_BASE) return "/";
	} catch {
		return "/";
	}
	return raw;
}
