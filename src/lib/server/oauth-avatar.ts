import { validateImageBuffer } from "./upload.ts";

/**
 * OAuth プロバイダーのプロフィール画像を、自前の Storage に取り込むための取得処理（#328）。
 *
 * 外部の画像 URL をそのまま保存すると、CSP の img-src に無い配信元（Discord・X）は表示できず、
 * 本人がプロバイダー側で画像を変えると URL が切れる。閲覧者のブラウザが外部へ直接アクセスする
 * ことにもなるので、プロフィール作成時に一度だけ取得して自前で配信する。
 *
 * 任意の URL を取得するとサーバーから内部・外部へ好きにリクエストさせられるため、取得先は
 * 各プロバイダーの画像配信元に限定する。scripts/ からも使うので $lib の別名は使わない。
 */
export const OAUTH_AVATAR_HOSTS = ["cdn.discordapp.com", "lh3.googleusercontent.com", "pbs.twimg.com"] as const;
export const OAUTH_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const OAUTH_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;

/** OAuth の user_metadata から画像 URL を取り出す（Discord・X は avatar_url、Google は picture） */
export function getOAuthAvatarUrl(metadata: Record<string, unknown> | null | undefined): string | null {
	for (const key of ["avatar_url", "picture"]) {
		const value = metadata?.[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

/** 取り込んでよい URL なら、なるべく大きい画像を指す URL にして返す。対象外なら null */
export function parseOAuthAvatarUrl(raw: string | null | undefined): URL | null {
	if (!raw) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
	if (!(OAUTH_AVATAR_HOSTS as readonly string[]).includes(url.hostname)) return null;

	// どのプロバイダーも既定は小さい画像（Google 96px、X 48px、Discord 128px）なので一段大きくする
	if (url.hostname === "cdn.discordapp.com") {
		url.searchParams.set("size", "256");
	} else if (url.hostname === "lh3.googleusercontent.com") {
		url.pathname = url.pathname.replace(/=s\d+(-c)?$/, "=s256-c");
	} else if (url.hostname === "pbs.twimg.com") {
		url.pathname = url.pathname.replace(/_normal(\.\w+)$/, "_400x400$1");
	}
	return url;
}

export type FetchedAvatar = { bytes: ArrayBuffer; mime: string; ext: string };

/**
 * 画像を取得して検証する。取得できない・画像でない・大きすぎる場合は null。
 * 失敗の理由は呼び出し側で区別しない（どの場合も「取り込まない」で扱う）。
 */
export async function fetchOAuthAvatar(
	raw: string | null | undefined,
	fetchFn: typeof fetch = fetch,
): Promise<FetchedAvatar | null> {
	const url = parseOAuthAvatarUrl(raw);
	if (!url) return null;

	let res: Response;
	try {
		// リダイレクト先は配信元の検証をしていないので追わない
		res = await fetchFn(url, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	} catch {
		return null;
	}
	if (!res.ok || !res.body) return null;
	if (Number(res.headers.get("content-length") ?? 0) > OAUTH_AVATAR_MAX_BYTES) {
		await res.body.cancel().catch(() => {});
		return null;
	}

	const bytes = await readBodyWithLimit(res.body, OAUTH_AVATAR_MAX_BYTES);
	if (!bytes) return null;
	const validated = validateImageBuffer(bytes, OAUTH_AVATAR_TYPES);
	return validated ? { bytes, ...validated } : null;
}

async function readBodyWithLimit(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<ArrayBuffer | null> {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel().catch(() => {});
				return null;
			}
			chunks.push(value);
		}
	} catch {
		return null;
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged.buffer;
}
