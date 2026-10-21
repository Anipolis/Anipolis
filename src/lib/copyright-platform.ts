// 作品の権利表記ではない、SNS・動画・配信プラットフォーム自体の © を見分ける。
// 公式サイト欄に X や YouTube の URL が入っている作品で、© 収集がそのページの
// フッター（「© 2026 X Corp.」「© 2026 Google LLC」）を作品の © として拾っていた。

const PLATFORM_HOSTS = [
	"x.com",
	"twitter.com",
	"youtube.com",
	"youtu.be",
	"instagram.com",
	"facebook.com",
	"tiktok.com",
	"store.steampowered.com",
];

const PLATFORM_COPYRIGHT =
	/\bX Corp\b|\bTwitter,? Inc\b|\bGoogle LLC\b|\bYouTube,? LLC\b|\bByteDance\b|\bTikTok\b|\bMeta Platforms\b|\bInstagram\b|\bFacebook,? Inc\b|\bValve Corporation\b/;

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
	} catch {
		return null;
	}
}

/** URL が SNS・動画・配信プラットフォームのページか */
export function isPlatformPageUrl(url: string | null | undefined): boolean {
	const host = url ? hostOf(url) : null;
	return host !== null && PLATFORM_HOSTS.some((platform) => host === platform || host.endsWith(`.${platform}`));
}

/** URL が X（旧 Twitter）のページか。公式サイト欄には採用しない（公式X欄に入る） */
export function isXUrl(url: string | null | undefined): boolean {
	const host = url ? hostOf(url) : null;
	return host === "x.com" || host === "twitter.com";
}

/** 作品ではなくプラットフォーム自体の © か（「© 2026 X Corp.」など） */
export function isPlatformCopyright(value: string | null | undefined): boolean {
	return value ? PLATFORM_COPYRIGHT.test(value) : false;
}
