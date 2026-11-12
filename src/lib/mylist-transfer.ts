// マイリストの読み込み・書き出し（#358）。MyAnimeList の XML（公式のエクスポート形式）と、
// Anipolis の CSV を扱う。作品は MAL の ID で突き合わせる（題名の照合はしない）。
// サーバー（/api/mylist/*）とテストで使う純粋な関数だけを置く。

import { XMLParser } from "fast-xml-parser";
import type { AnimeStatus } from "$lib/types";

export interface TransferEntry {
	malId: number;
	title: string;
	status: AnimeStatus;
	/** 1〜10。付けていなければ null */
	score: number | null;
	progress: number;
	startedOn: string | null;
	finishedOn: string | null;
}

export interface ParseResult {
	entries: TransferEntry[];
	/** 読めなかった行（ID が無い・ステータスが分からないなど） */
	invalid: { line: string; reason: string }[];
}

export interface ExportEntry {
	malId: number | null;
	title: string;
	type: string | null;
	episodeCount: number | null;
	status: AnimeStatus;
	score: number | null;
	progress: number;
	startedOn: string | null;
	finishedOn: string | null;
}

/** 読み込める件数の上限（MAL の大きなリストでも数千件） */
export const MAX_IMPORT_ENTRIES = 10_000;
/** ファイルの大きさの上限（gzip を解いた後） */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** バイト順マーク。Excel で開く CSV に付け、読み込むときは外す */
const BOM = String.fromCharCode(0xfeff);

const MAL_STATUS: Record<string, AnimeStatus> = {
	watching: "watching",
	completed: "completed",
	"on-hold": "on_hold",
	onhold: "on_hold",
	on_hold: "on_hold",
	dropped: "dropped",
	"plan to watch": "plan_to_watch",
	plantowatch: "plan_to_watch",
	plan_to_watch: "plan_to_watch",
	// MAL の数値表記（API・古いエクスポート）
	"1": "watching",
	"2": "completed",
	"3": "on_hold",
	"4": "dropped",
	"6": "plan_to_watch",
};

const STATUS_TO_MAL: Record<AnimeStatus, string> = {
	watching: "Watching",
	completed: "Completed",
	on_hold: "On-Hold",
	dropped: "Dropped",
	plan_to_watch: "Plan to Watch",
};

export function parseTransferStatus(value: unknown): AnimeStatus | null {
	const key = String(value ?? "")
		.trim()
		.toLowerCase();
	return MAL_STATUS[key] ?? null;
}

function parseScore(value: unknown): number | null {
	const score = Number(String(value ?? "").trim());
	return Number.isInteger(score) && score >= 1 && score <= 10 ? score : null;
}

function parseProgress(value: unknown): number {
	const progress = Number(String(value ?? "").trim());
	return Number.isInteger(progress) && progress > 0 ? Math.min(progress, 100_000) : 0;
}

/** "2024-03-05" のような実在する日付だけを通す。MAL の未入力 "0000-00-00" や月日の 00 は null */
export function parseTransferDate(value: unknown): string | null {
	const text = String(value ?? "").trim();
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (!match) return null;
	const [, year, month, day] = match.map(Number) as [number, number, number, number];
	if (year < 1900 || month < 1 || day < 1) return null;
	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
	return text;
}

/** 日付の順番が逆（見始めた日 > 見終えた日）なら、見始めた日を捨てる（DB の制約に合わせる） */
function orderedDates(startedOn: string | null, finishedOn: string | null) {
	if (startedOn && finishedOn && startedOn > finishedOn) return { startedOn: null, finishedOn };
	return { startedOn, finishedOn };
}

function toEntry(raw: {
	malId: unknown;
	title: unknown;
	status: unknown;
	score: unknown;
	progress: unknown;
	startedOn: unknown;
	finishedOn: unknown;
}): TransferEntry | { reason: string } {
	const malId = Number(String(raw.malId ?? "").trim());
	if (!Number.isInteger(malId) || malId <= 0) return { reason: "MAL の ID がありません" };
	const status = parseTransferStatus(raw.status);
	if (!status) return { reason: `ステータス「${String(raw.status ?? "")}」が分かりません` };
	return {
		malId,
		title: String(raw.title ?? "").trim(),
		status,
		score: parseScore(raw.score),
		progress: parseProgress(raw.progress),
		...orderedDates(parseTransferDate(raw.startedOn), parseTransferDate(raw.finishedOn)),
	};
}

function pushParsed(result: ParseResult, entry: ReturnType<typeof toEntry>, line: string) {
	if ("reason" in entry) result.invalid.push({ line, reason: entry.reason });
	else result.entries.push(entry);
}

/** MyAnimeList のエクスポート（animelist_*.xml）を読む */
export function parseMalXml(xml: string): ParseResult {
	const parser = new XMLParser({
		ignoreAttributes: true,
		parseTagValue: false,
		trimValues: true,
		processEntities: true,
		isArray: (name) => name === "anime",
	});
	let document: { myanimelist?: { anime?: Record<string, unknown>[] } };
	try {
		document = parser.parse(xml);
	} catch {
		throw new Error("XML として読めませんでした");
	}
	if (!document?.myanimelist)
		throw new Error("MyAnimeList のエクスポートではありません（<myanimelist> がありません）");
	const result: ParseResult = { entries: [], invalid: [] };
	for (const anime of document.myanimelist.anime ?? []) {
		const title = String(anime["series_title"] ?? "");
		pushParsed(
			result,
			toEntry({
				malId: anime["series_animedb_id"],
				title,
				status: anime["my_status"],
				score: anime["my_score"],
				progress: anime["my_watched_episodes"],
				startedOn: anime["my_start_date"],
				finishedOn: anime["my_finish_date"],
			}),
			title || String(anime["series_animedb_id"] ?? "?"),
		);
	}
	return result;
}

/** RFC 4180 の CSV を行・列に分ける（引用符の中のカンマ・改行・"" に対応） */
export function parseCsvRows(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	const source = text.startsWith(BOM) ? text.slice(1) : text;
	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quoted) {
			if (char === '"' && source[index + 1] === '"') {
				field += '"';
				index++;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"') quoted = true;
		else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && source[index + 1] === "\n") index++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += char;
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** 列名の別名（Anipolis の書き出し・MAL の XML の要素名・よくある表記） */
const CSV_COLUMNS: Record<keyof TransferEntry, string[]> = {
	malId: ["mal_id", "series_animedb_id", "malid", "mal id", "anime_id(mal)"],
	title: ["title", "series_title", "題名", "タイトル"],
	status: ["status", "my_status", "ステータス"],
	score: ["score", "my_score", "スコア"],
	progress: ["progress", "my_watched_episodes", "watched_episodes", "episodes_watched", "進捗", "視聴話数"],
	startedOn: ["started_on", "my_start_date", "start_date", "見始めた日"],
	finishedOn: ["finished_on", "my_finish_date", "finish_date", "見終えた日"],
};

/** CSV（1 行目が列名）を読む。最低限 mal_id と status の列が要る */
export function parseMylistCsv(text: string): ParseResult {
	const rows = parseCsvRows(text);
	const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
	const columnOf = (key: keyof TransferEntry) => header.findIndex((name) => CSV_COLUMNS[key].includes(name));
	const columns = {
		malId: columnOf("malId"),
		title: columnOf("title"),
		status: columnOf("status"),
		score: columnOf("score"),
		progress: columnOf("progress"),
		startedOn: columnOf("startedOn"),
		finishedOn: columnOf("finishedOn"),
	};
	if (columns.malId < 0 || columns.status < 0) {
		throw new Error("CSV の 1 行目に mal_id と status の列が必要です");
	}
	const result: ParseResult = { entries: [], invalid: [] };
	for (const cells of rows.slice(1)) {
		const cell = (index: number) => (index >= 0 ? cells[index] : undefined);
		const title = cell(columns.title) ?? "";
		pushParsed(
			result,
			toEntry({
				malId: cell(columns.malId),
				title,
				status: cell(columns.status),
				score: cell(columns.score),
				progress: cell(columns.progress),
				startedOn: cell(columns.startedOn),
				finishedOn: cell(columns.finishedOn),
			}),
			title || cell(columns.malId) || "?",
		);
	}
	return result;
}

/** 中身を見て形式を決める（拡張子に頼らない） */
export function parseMylistFile(text: string): ParseResult {
	const head = (text.startsWith(BOM) ? text.slice(1) : text).trimStart();
	return head.startsWith("<") ? parseMalXml(text) : parseMylistCsv(text);
}

/** 同じ作品が何度も出てきたら、後に出てきた行を使う */
export function dedupeEntries(entries: TransferEntry[]): TransferEntry[] {
	return [...new Map(entries.map((entry) => [entry.malId, entry])).values()];
}

function escapeXml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function cdata(text: string): string {
	return `<![CDATA[${text.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

/**
 * MyAnimeList の取り込み形式（XML）で書き出す。MAL の ID が無い作品は MAL では読めないので含めない。
 * MAL の「Import」や、MAL の XML を読める他のサービスでそのまま使える。
 */
export function toMalXml(entries: ExportEntry[], username: string): string {
	const rows = entries.filter((entry) => entry.malId);
	const count = (status: AnimeStatus) => rows.filter((entry) => entry.status === status).length;
	const lines = [
		'<?xml version="1.0" encoding="UTF-8" ?>',
		"<myanimelist>",
		"\t<myinfo>",
		`\t\t<user_name>${escapeXml(username)}</user_name>`,
		"\t\t<user_export_type>1</user_export_type>",
		`\t\t<user_total_anime>${rows.length}</user_total_anime>`,
		`\t\t<user_total_watching>${count("watching")}</user_total_watching>`,
		`\t\t<user_total_completed>${count("completed")}</user_total_completed>`,
		`\t\t<user_total_onhold>${count("on_hold")}</user_total_onhold>`,
		`\t\t<user_total_dropped>${count("dropped")}</user_total_dropped>`,
		`\t\t<user_total_plantowatch>${count("plan_to_watch")}</user_total_plantowatch>`,
		"\t</myinfo>",
	];
	for (const entry of rows) {
		lines.push(
			"\t<anime>",
			`\t\t<series_animedb_id>${entry.malId}</series_animedb_id>`,
			`\t\t<series_title>${cdata(entry.title)}</series_title>`,
			`\t\t<series_type>${escapeXml(entry.type ?? "")}</series_type>`,
			`\t\t<series_episodes>${entry.episodeCount ?? 0}</series_episodes>`,
			"\t\t<my_id>0</my_id>",
			`\t\t<my_watched_episodes>${entry.progress}</my_watched_episodes>`,
			`\t\t<my_start_date>${entry.startedOn ?? "0000-00-00"}</my_start_date>`,
			`\t\t<my_finish_date>${entry.finishedOn ?? "0000-00-00"}</my_finish_date>`,
			`\t\t<my_score>${entry.score ?? 0}</my_score>`,
			`\t\t<my_status>${STATUS_TO_MAL[entry.status]}</my_status>`,
			"\t\t<my_times_watched>0</my_times_watched>",
			"\t\t<update_on_import>1</update_on_import>",
			"\t</anime>",
		);
	}
	lines.push("</myanimelist>", "");
	return lines.join("\n");
}

function csvCell(value: string | number | null): string {
	const text = value === null ? "" : String(value);
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Anipolis の CSV。MAL の ID が無い作品も含める（読み込み直すときは MAL の ID がある行だけが対象） */
export function toMylistCsv(entries: ExportEntry[]): string {
	const header = ["mal_id", "title", "type", "status", "score", "progress", "episodes", "started_on", "finished_on"];
	const lines = [header.join(",")];
	for (const entry of entries) {
		lines.push(
			[
				entry.malId,
				entry.title,
				entry.type,
				entry.status,
				entry.score,
				entry.progress,
				entry.episodeCount,
				entry.startedOn,
				entry.finishedOn,
			]
				.map(csvCell)
				.join(","),
		);
	}
	// Excel で文字化けしないよう BOM を付ける
	return `${BOM}${lines.join("\r\n")}\r\n`;
}
