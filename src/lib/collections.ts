/** コレクション（#515）の上限。DB の制約（179_collections）と同じ */
export const MAX_COLLECTIONS_PER_USER = 20;
export const MAX_COLLECTION_ITEMS = 100;
export const MAX_COLLECTION_TITLE_LENGTH = 50;
export const MAX_COLLECTION_DESCRIPTION_LENGTH = 300;

export interface CollectionInput {
	title: string;
	description: string | null;
	isPublic: boolean;
}

export type CollectionInputResult =
	| { ok: true; value: CollectionInput }
	| { ok: false; field: "title" | "description"; message: string };

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
	return {
		ok: true,
		value: { title, description: rawDescription || null, isPublic: form.get("is_public") === "on" },
	};
}

const COLLECTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL の ID がコレクションの ID の形か（違えば DB に問い合わせずに「見つからない」にする） */
export function isCollectionId(value: string): boolean {
	return COLLECTION_ID_PATTERN.test(value);
}
