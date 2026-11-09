/** コレクション（#515）の上限。DB の制約（179_collections）と同じ */
export const MAX_COLLECTIONS_PER_USER = 20;
export const MAX_COLLECTION_ITEMS = 100;
export const MAX_COLLECTION_TITLE_LENGTH = 50;
export const MAX_COLLECTION_DESCRIPTION_LENGTH = 300;

/** コレクションの種類（192）。ランキングは並び順が順位、ティア表は段（S・A・B…）に分ける */
export type CollectionKind = "list" | "ranking" | "tier";
export const COLLECTION_KINDS: { value: CollectionKind; label: string }[] = [
	{ value: "list", label: "リスト" },
	{ value: "ranking", label: "ランキング" },
	{ value: "tier", label: "ティア表" },
];
export const COLLECTION_KIND_LABELS: Record<CollectionKind, string> = {
	list: "リスト",
	ranking: "ランキング",
	tier: "ティア表",
};
/** ティア表の段（DB の制約と同じ: 1〜10段、名前は1〜10文字） */
export const DEFAULT_COLLECTION_TIERS = ["S", "A", "B", "C", "D"];
export const MAX_COLLECTION_TIERS = 10;
export const MAX_COLLECTION_TIER_LABEL_LENGTH = 10;
/** 段の色（よくあるティア表と同じく、上の段から赤→橙→黄→緑→青→紫）。名前を変えても位置で決める */
const COLLECTION_TIER_COLORS = [
	"#ff7f7f",
	"#ffbf7f",
	"#ffdf7f",
	"#ffff7f",
	"#bfff7f",
	"#7fff7f",
	"#7fffff",
	"#7fbfff",
	"#7f7fff",
	"#ff7fff",
];

export function collectionTierColor(tier: number): string {
	return COLLECTION_TIER_COLORS[tier % COLLECTION_TIER_COLORS.length] ?? "#ff7f7f";
}

/** 件数の前に付ける種類（「ランキング・」など。リストは付けない） */
export function collectionKindPrefix(kind: CollectionKind): string {
	return kind === "list" ? "" : `${COLLECTION_KIND_LABELS[kind]}・`;
}

export function isCollectionKind(value: unknown): value is CollectionKind {
	return value === "list" || value === "ranking" || value === "tier";
}

/** 作品ページの「コレクションに追加」で並べる、自分のコレクションと作品が入っているか（#515） */
export interface CollectionMembership {
	id: string;
	title: string;
	is_public: boolean;
	item_count: number;
	/** この作品が入っているか */
	has_anime: boolean;
	/** 並びで最初の、カバーのある作品のカバー（サムネイルに使う。無ければ null） */
	cover: string | null;
}

/** 並びで最初の、カバーのある作品のカバー */
export function firstCollectionCover(animeIds: number[], covers: ReadonlyMap<number, string | null>): string | null {
	for (const id of animeIds) {
		const cover = covers.get(id);
		if (cover) return cover;
	}
	return null;
}

export interface CollectionInput {
	title: string;
	description: string | null;
	isPublic: boolean;
	kind: CollectionKind;
	/** ティア表のときだけ。ほかの種類では今の段をそのまま残す */
	tiers: string[] | null;
	/** tiers と同じ長さで、各段が元は何番目だったか（新しく足した段は null） */
	tierOrigins: (number | null)[] | null;
}

export type CollectionInputResult =
	| { ok: true; value: CollectionInput }
	| { ok: false; field: "title" | "description" | "tiers"; message: string };

/** 段の名前の並びを確かめる（DB の制約と同じ）。よければ null */
export function collectionTiersError(tiers: string[]): string | null {
	if (tiers.length === 0 || tiers.some((label) => !label)) return "段の名前を入力してください";
	if (tiers.length > MAX_COLLECTION_TIERS) return `段は${MAX_COLLECTION_TIERS}個までです`;
	if (tiers.some((label) => label.length > MAX_COLLECTION_TIER_LABEL_LENGTH)) {
		return `段の名前は${MAX_COLLECTION_TIER_LABEL_LENGTH}文字以内で入力してください`;
	}
	return null;
}

/** フォームの値を確かめて整える（題名は前後の空白を落とし、空の説明は null にする） */
export function parseCollectionInput(form: FormData): CollectionInputResult {
	const title = String(form.get("title") ?? "").trim();
	const rawDescription = String(form.get("description") ?? "").trim();
	if (!title) return { ok: false, field: "title", message: "題名を入力してください" };
	if (title.length > MAX_COLLECTION_TITLE_LENGTH) {
		return { ok: false, field: "title", message: `題名は${MAX_COLLECTION_TITLE_LENGTH}文字以内で入力してください` };
	}
	if (rawDescription.length > MAX_COLLECTION_DESCRIPTION_LENGTH) {
		return {
			ok: false,
			field: "description",
			message: `説明は${MAX_COLLECTION_DESCRIPTION_LENGTH}文字以内で入力してください`,
		};
	}
	const rawKind = form.get("kind") ?? "list";
	const kind: CollectionKind = isCollectionKind(rawKind) ? rawKind : "list";
	let tiers: string[] | null = null;
	let tierOrigins: (number | null)[] | null = null;
	if (kind === "tier") {
		tiers = form.getAll("tier").map((label) => String(label).trim());
		const origins = form.getAll("tier_origin").map((value) => String(value).trim());
		tierOrigins = tiers.map((_, index) => {
			const origin = Number(origins[index] ?? "");
			return origins[index] && Number.isInteger(origin) && origin >= 0 ? origin : null;
		});
		const tiersError = collectionTiersError(tiers);
		if (tiersError) return { ok: false, field: "tiers", message: tiersError };
	}
	return {
		ok: true,
		value: {
			title,
			description: rawDescription || null,
			isPublic: form.get("is_public") === "on",
			kind,
			tiers,
			tierOrigins,
		},
	};
}

const COLLECTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL の ID がコレクションの ID の形か（違えば DB に問い合わせずに「見つからない」にする） */
export function isCollectionId(value: string): boolean {
	return COLLECTION_ID_PATTERN.test(value);
}

/**
 * ティア表の並び: 段の順（上の段から、未分類は最後）に、段の中は今の並び順のまま並べ直す。
 * 段の番号が今の段の数を超えるもの（段を減らした直後など）は未分類として扱う
 */
export function orderByTier<T extends { tier: number | null }>(items: T[], tierCount: number): T[] {
	const rank = (tier: number | null) => (tier === null || tier >= tierCount ? tierCount : tier);
	return items
		.map((item, index) => ({ item, index }))
		.sort((a, b) => rank(a.item.tier) - rank(b.item.tier) || a.index - b.index)
		.map(({ item }) => item);
}

/** 作品を1つ足したあとの並び（末尾に足す。入っていればそのまま） */
export function withAnimeAdded(animeIds: number[], animeId: number): number[] {
	return animeIds.includes(animeId) ? animeIds : [...animeIds, animeId];
}

/** 作品を1つ外したあとの並び（入っていなければそのまま） */
export function withAnimeRemoved(animeIds: number[], animeId: number): number[] {
	return animeIds.filter((id) => id !== animeId);
}

/** 投稿でシェアしたコレクションのカード（193）。投稿は参照だけを持ち、中身は表示のたびに今のものを読む */
export interface CollectionShare {
	id: string;
	title: string;
	kind: CollectionKind;
	tiers: string[];
	count: number;
	/** リスト・ランキングは先頭5作品、ティア表は上から5段までを各段8作品まで（collection_preview） */
	items: { id: number; title: string; cover_url: string | null; tier: number | null }[];
}

/** 投稿に JOIN したコレクション（collection_preview つき）をカードの形にする。見えない・形が違うなら null */
export function toCollectionShare(raw: unknown): CollectionShare | null {
	const row = Array.isArray(raw) ? raw[0] : raw;
	if (!row || typeof row !== "object") return null;
	const value = row as Record<string, unknown>;
	if (typeof value["id"] !== "string" || typeof value["title"] !== "string") return null;
	const preview = (value["collection_preview"] ?? {}) as { count?: unknown; items?: unknown };
	const items = Array.isArray(preview.items) ? preview.items : [];
	return {
		id: value["id"],
		title: value["title"],
		kind: isCollectionKind(value["kind"]) ? value["kind"] : "list",
		tiers: Array.isArray(value["tiers"])
			? value["tiers"].filter((tier): tier is string => typeof tier === "string")
			: [],
		count: typeof preview.count === "number" ? preview.count : items.length,
		items: items
			.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
			.map((item) => ({
				id: Number(item["id"]),
				title: typeof item["title"] === "string" ? item["title"] : "",
				cover_url: typeof item["cover_url"] === "string" ? item["cover_url"] : null,
				tier: typeof item["tier"] === "number" ? item["tier"] : null,
			}))
			.filter((item) => Number.isFinite(item.id)),
	};
}

/** シェアのカード・投稿欄のプレビューで読むコレクションの列 */
// collection_preview は計算列（193）。型の生成に出てこないので、select の型推論に回さないよう string にしておく
export const COLLECTION_SHARE_SELECT = "id, title, kind, tiers, collection_preview" as string;
