/**
 * 一覧の続きの目印（#243 / #250）。作成日時と、同じ時刻の中での並びを決める ID の組。
 * 一覧は（作成日時, ID）の降順で並べ、次のページは目印より前の行を取る。
 * クライアントからも使うので $lib/server に置かない。
 */
export type TimelineCursor = {
	createdAt: string;
	id: string;
};

// PostgREST のフィルタ（or=(created_at.lt.…,and(…,id.lt.…))）に埋め込むので、形を厳密に見る
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const CURSOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL の before / before_id から続きの目印を読む。どちらかが無いか形が違えば undefined（先頭のページ） */
export function parseTimelineCursor(searchParams: URLSearchParams): TimelineCursor | undefined {
	const createdAt = searchParams.get("before");
	const id = searchParams.get("before_id");
	if (!createdAt || !id) return undefined;
	if (!CURSOR_TIMESTAMP_PATTERN.test(createdAt) || !CURSOR_ID_PATTERN.test(id)) return undefined;
	return { createdAt, id };
}

/** 続きのページの URL。今のクエリ（tab など）は残し、before / before_id だけを差し替える */
export function timelineCursorHref(url: URL, cursor: TimelineCursor): string {
	const params = new URLSearchParams(url.search);
	params.set("before", cursor.createdAt);
	params.set("before_id", cursor.id);
	return `${url.pathname}?${params.toString()}`;
}

/**
 * タイムスタンプをマイクロ秒の数にする（並べ替え用）。DB はマイクロ秒まで持つが、Date はミリ秒までなので、
 * Date で比べると同じミリ秒の中の並びが DB と食い違い、続きのページで重複・欠落が出る。
 */
export function timestampMicros(value: string): number {
	const match = value.match(/^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(.*)$/);
	if (!match) return Date.parse(value) * 1000;
	const [, head = "", fraction = "", zone = ""] = match;
	return Date.parse(`${head}${zone || "Z"}`) * 1000 + Number(fraction.padEnd(6, "0"));
}

/** （作成日時, ID）の降順。DB の order("created_at", desc).order(id, desc) と同じ並び */
export function compareTimelineDesc(a: TimelineCursor, b: TimelineCursor): number {
	const diff = timestampMicros(b.createdAt) - timestampMicros(a.createdAt);
	if (diff !== 0) return diff;
	return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** PostgREST の or フィルタ: 目印より前（古い）の行。idColumn は同じ時刻の中での並びに使う列 */
export function timelineCursorFilter(cursor: TimelineCursor, idColumn: string): string {
	return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},${idColumn}.lt.${cursor.id})`;
}
