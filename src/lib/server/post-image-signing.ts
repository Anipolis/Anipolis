import type { SupabaseClient } from "@supabase/supabase-js";
import { postImageMediaUrl, postImagePathFromUrl } from "$lib/post-image-url";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import type { Database } from "$lib/supabase/database.types";

/**
 * 投稿画像の期限付き URL を発行する（#316）。
 *
 * post-images は非公開（148）。呼び出し側は、閲覧できると確かめた投稿の画像だけを渡すこと
 * （enrichPostsWithCounts は RLS で読めた投稿だけを扱う）。発行は service role で行う。
 *
 * 期限は1時間。鍵化・非表示の後も、既に開いているページでは最大1時間は見えるが、
 * 以前の公開 URL のように無期限には残らない。
 * 同じ画像を何度も表示するたびに別の URL になるとブラウザのキャッシュが効かないので、
 * 期限まで十分残っている URL は使い回す（Workers の isolate ごとのメモリ）。
 */
export const POST_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;
/** 残りがこれより短い URL は使い回さない（ページを開いている間に切れないように） */
const REUSE_MIN_REMAINING_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;

const cache = new Map<string, { signedUrl: string; expiresAt: number }>();

function cached(path: string, now: number): string | null {
	const entry = cache.get(path);
	if (!entry) return null;
	if (entry.expiresAt - now < REUSE_MIN_REMAINING_MS) {
		cache.delete(path);
		return null;
	}
	return entry.signedUrl;
}

function remember(path: string, signedUrl: string, now: number) {
	if (cache.size >= MAX_CACHE_ENTRIES) {
		for (const [key, entry] of cache) {
			if (entry.expiresAt - now < REUSE_MIN_REMAINING_MS) cache.delete(key);
		}
		// それでも多ければ古い順に捨てる（Map は挿入順）
		for (const key of cache.keys()) {
			if (cache.size < MAX_CACHE_ENTRIES) break;
			cache.delete(key);
		}
	}
	cache.set(path, { signedUrl, expiresAt: now + POST_IMAGE_SIGNED_URL_TTL_SECONDS * 1000 });
}

/**
 * 保存している画像の URL → ページに出す URL の対応を返す。
 * 発行できなかった画像は固定リンク（/api/media/…、アクセス時に権限を確かめて転送する）にする。
 */
export async function signPostImageUrls(
	urls: readonly string[],
	client?: SupabaseClient<Database>,
	now = Date.now(),
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const pending = new Map<string, string>(); // path → 保存している URL
	for (const url of new Set(urls)) {
		const path = postImagePathFromUrl(url);
		if (!path) {
			result.set(url, url);
			continue;
		}
		const reuse = cached(path, now);
		if (reuse) result.set(url, reuse);
		else pending.set(path, url);
	}
	if (pending.size === 0) return result;

	try {
		const { data, error } = await (client ?? createServiceRoleClient()).storage
			.from("post-images")
			.createSignedUrls([...pending.keys()], POST_IMAGE_SIGNED_URL_TTL_SECONDS);
		if (error) throw error;
		for (const item of data ?? []) {
			const url = item.path ? pending.get(item.path) : undefined;
			if (!url || !item.path || item.error || !item.signedUrl) continue;
			remember(item.path, item.signedUrl, now);
			result.set(url, item.signedUrl);
		}
	} catch (error) {
		console.error("signPostImageUrls failed:", error);
	}
	for (const url of pending.values()) {
		if (!result.has(url)) result.set(url, postImageMediaUrl(url));
	}
	return result;
}

/** テスト用: 使い回しのキャッシュを空にする */
export function clearPostImageSignatureCache() {
	cache.clear();
}
