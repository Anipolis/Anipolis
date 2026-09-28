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
		imageUrls: Array.isArray(stored.imageUrls)
			? stored.imageUrls.filter((url): url is string => typeof url === "string")
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
