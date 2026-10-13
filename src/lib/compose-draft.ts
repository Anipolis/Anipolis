/**
 * 投稿フォームの下書き保存（GitLab #2）。
 *
 * モバイルの投稿モーダルは閉じると PostComposer ごと破棄されるため、書きかけの内容を
 * コンポーネントの外（localStorage）に退避し、再度開いたときに復元する。
 *
 * 保存ポリシー:
 * - キーはユーザー ID ごとに分ける（複数アカウント切替時に他人の下書きが混ざらないように）
 * - 本文・画像・引用作品のいずれも無い状態は「下書き無し」とみなして保存を消す
 *   （投稿成功後にフォームが空になると自動的に消えるのはこのため）
 * - 保存から DRAFT_TTL_MS（7 日）を過ぎた下書きは読み込み時に破棄する
 * - localStorage が使えない環境（プライベートモード等）では例外を握りつぶし、保存無しで動作する
 */

import { isPostImageUsable } from "$lib/post-image-lifetime";
import type { OpenBroadcastRoomSummary } from "$lib/types";

export interface ComposeDraftAnime {
	id: string;
	title: string;
	title_en: string | null;
	cover_url: string | null;
	official_hashtag?: string[] | null;
}

export interface ComposeDraft {
	content: string;
	imageUrls: string[];
	anime: ComposeDraftAnime | null;
	cwAnime: ComposeDraftAnime | null;
	room: OpenBroadcastRoomSummary | null;
}

interface StoredComposeDraft extends ComposeDraft {
	/** 保存形式のバージョン。形が変わったら上げて古い保存を無視する */
	v: 1;
	savedAt: number;
}

/** localStorage 互換の最小インターフェース（テストではメモリ実装を渡す） */
export interface DraftStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** 下書きの保持期間。これを過ぎたものは読み込み時に捨てる */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DRAFT_KEY_PREFIX = "anipolis_compose_draft:";

export function composeDraftKey(userId: string): string {
	return `${DRAFT_KEY_PREFIX}${userId}`;
}

export function createEmptyDraft(): ComposeDraft {
	return { content: "", imageUrls: [], anime: null, cwAnime: null, room: null };
}

/** 保存する価値のある内容が無い（本文・画像・引用作品のいずれも無い）なら true */
export function isDraftEmpty(draft: ComposeDraft): boolean {
	return draft.content.trim().length === 0 && draft.imageUrls.length === 0 && draft.anime === null;
}

/**
 * ブラウザーの localStorage を安全に取得する。
 * 参照するだけで例外になる環境があるので try/catch で包み、使えなければ null。
 */
export function getBrowserDraftStorage(): DraftStorage | null {
	try {
		if (typeof window === "undefined" || !window.localStorage) return null;
		return window.localStorage;
	} catch {
		return null;
	}
}

function isAnime(value: unknown): value is ComposeDraftAnime {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return typeof v["id"] === "string" && typeof v["title"] === "string";
}

function isRoom(value: unknown): value is OpenBroadcastRoomSummary {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return typeof v["id"] === "string" && typeof v["anime_id"] === "string";
}

/** 保存文字列を下書きに戻す。壊れている・古い形式・期限切れなら null。 */
export function parseComposeDraft(raw: string | null, now = Date.now()): ComposeDraft | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const stored = parsed as Partial<StoredComposeDraft>;
	if (stored.v !== 1) return null;
	if (typeof stored.savedAt !== "number" || now - stored.savedAt > DRAFT_TTL_MS) return null;

	const draft: ComposeDraft = {
		content: typeof stored.content === "string" ? stored.content : "",
		// 使用期限（アップロードから7日）を過ぎた画像は外す。回収済みかもしれないため（#330）
		imageUrls: Array.isArray(stored.imageUrls)
			? stored.imageUrls.filter((url): url is string => typeof url === "string" && isPostImageUsable(url, now))
			: [],
		anime: isAnime(stored.anime) ? stored.anime : null,
		cwAnime: isAnime(stored.cwAnime) ? stored.cwAnime : null,
		room: isRoom(stored.room) ? stored.room : null,
	};
	return isDraftEmpty(draft) ? null : draft;
}

/** 下書きを保存文字列にする。空の下書きは null（保存しない）。 */
export function serializeComposeDraft(draft: ComposeDraft, now = Date.now()): string | null {
	if (isDraftEmpty(draft)) return null;
	const stored: StoredComposeDraft = { v: 1, savedAt: now, ...draft };
	return JSON.stringify(stored);
}

export function loadComposeDraft(storage: DraftStorage | null, userId: string, now = Date.now()): ComposeDraft | null {
	if (!storage) return null;
	const key = composeDraftKey(userId);
	try {
		const draft = parseComposeDraft(storage.getItem(key), now);
		// 期限切れ・破損した保存は読み込み時に掃除しておく
		if (!draft) storage.removeItem(key);
		return draft;
	} catch {
		return null;
	}
}

export function saveComposeDraft(storage: DraftStorage | null, userId: string, draft: ComposeDraft, now = Date.now()) {
	if (!storage) return;
	const key = composeDraftKey(userId);
	try {
		const serialized = serializeComposeDraft(draft, now);
		if (serialized === null) {
			storage.removeItem(key);
		} else {
			storage.setItem(key, serialized);
		}
	} catch {
		// 容量超過やプライベートモードなど。下書き保存は補助機能なので黙って諦める
	}
}

export function clearComposeDraft(storage: DraftStorage | null, userId: string) {
	if (!storage) return;
	try {
		storage.removeItem(composeDraftKey(userId));
	} catch {
		// 同上
	}
}

// ---- 直前の投稿の文脈（#331） ----
// CW とルームの指定は、連投しやすいよう投稿後も引き継ぐ。PC では投稿欄がページに残るので
// そのまま残るが、スマホは投稿のたびにモーダルごと閉じ、本文が空の下書きは消えるので毎回外れていた。
// 本文の下書きとは別に短い間だけ保存し、次に投稿欄を開いたときに戻す。

export interface ComposeContext {
	cwAnime: ComposeDraftAnime | null;
	room: OpenBroadcastRoomSummary | null;
}

/** CW を戻す期限。同じ話題を続けて書く間は残し、時間が空けば外す */
export const COMPOSE_CONTEXT_CW_TTL_MS = 30 * 60 * 1000;
/** ルームを戻す期限。受付中かどうかは戻すときに確かめるので、こちらは古すぎる保存を捨てるだけ */
export const COMPOSE_CONTEXT_ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const CONTEXT_KEY_PREFIX = "anipolis_compose_context:";

export function composeContextKey(userId: string): string {
	return `${CONTEXT_KEY_PREFIX}${userId}`;
}

export function saveComposeContext(
	storage: DraftStorage | null,
	userId: string,
	context: ComposeContext,
	now = Date.now(),
) {
	if (!storage) return;
	const key = composeContextKey(userId);
	try {
		if (!context.cwAnime && !context.room) {
			storage.removeItem(key);
			return;
		}
		storage.setItem(key, JSON.stringify({ v: 1, savedAt: now, cwAnime: context.cwAnime, room: context.room }));
	} catch {
		// 下書きと同じく補助機能なので黙って諦める
	}
}

/** 期限内の文脈だけを返す。ルームが受付中かどうかは呼び出し側で確かめる */
export function loadComposeContext(storage: DraftStorage | null, userId: string, now = Date.now()): ComposeContext {
	const empty: ComposeContext = { cwAnime: null, room: null };
	if (!storage) return empty;
	try {
		const raw = storage.getItem(composeContextKey(userId));
		if (!raw) return empty;
		const parsed = JSON.parse(raw) as { v?: unknown; savedAt?: unknown; cwAnime?: unknown; room?: unknown };
		if (parsed.v !== 1 || typeof parsed.savedAt !== "number") return empty;
		const age = now - parsed.savedAt;
		return {
			cwAnime: age <= COMPOSE_CONTEXT_CW_TTL_MS && isAnime(parsed.cwAnime) ? parsed.cwAnime : null,
			room: age <= COMPOSE_CONTEXT_ROOM_TTL_MS && isRoom(parsed.room) ? parsed.room : null,
		};
	} catch {
		return empty;
	}
}

export function clearComposeContext(storage: DraftStorage | null, userId: string) {
	if (!storage) return;
	try {
		storage.removeItem(composeContextKey(userId));
	} catch {
		// 同上
	}
}
