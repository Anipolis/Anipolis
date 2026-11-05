import { describe, expect, it } from "vitest";
import { MYLIST_NOTE_MAX_LENGTH, parseMylistNote, parseWatchDates } from "./entry-details";
import { savedEntryFromResult } from "./entry-from-form";

function form(fields: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

describe("parseWatchDates（180）", () => {
	const today = "2026-10-30";

	it("欄が無ければ何も返さない（保存で日付を触らない）", () => {
		expect(parseWatchDates(form({ status: "watching" }), today)).toEqual({ ok: true, values: {} });
	});

	it("空欄は日付を消し、日付はそのまま受け付ける", () => {
		expect(parseWatchDates(form({ started_on: "", finished_on: "2026-10-30" }), today)).toEqual({
			ok: true,
			values: { started_on: null, finished_on: "2026-10-30" },
		});
	});

	it("形式の違う日付・今日より後・順番が逆の組み合わせは受け付けない", () => {
		expect(parseWatchDates(form({ started_on: "2026/10/01" }), today).ok).toBe(false);
		expect(parseWatchDates(form({ started_on: "2026-02-30" }), today).ok).toBe(false);
		expect(parseWatchDates(form({ finished_on: "2026-10-31" }), today).ok).toBe(false);
		expect(parseWatchDates(form({ started_on: "2026-10-10", finished_on: "2026-10-09" }), today).ok).toBe(false);
		expect(parseWatchDates(form({ started_on: "2026-10-10", finished_on: "2026-10-10" }), today).ok).toBe(true);
	});
});

describe("parseMylistNote（180）", () => {
	it("欄が無ければ undefined、空なら null（メモを消す）", () => {
		expect(parseMylistNote(form({}))).toEqual({ ok: true, value: undefined });
		expect(parseMylistNote(form({ note: "  \n " }))).toEqual({ ok: true, value: null });
	});

	it("改行を \n にそろえ、前後の空白を落とす", () => {
		expect(parseMylistNote(form({ note: " 2期の前に\r\n見直す " }))).toEqual({
			ok: true,
			value: "2期の前に\n見直す",
		});
	});

	it("上限を超えたら受け付けない（絵文字も1文字として数える）", () => {
		expect(parseMylistNote(form({ note: "😀".repeat(MYLIST_NOTE_MAX_LENGTH) })).ok).toBe(true);
		expect(parseMylistNote(form({ note: "あ".repeat(MYLIST_NOTE_MAX_LENGTH + 1) })).ok).toBe(false);
	});
});

describe("savedEntryFromResult", () => {
	const previous = {
		status: "plan_to_watch" as const,
		score: null,
		progress: 0,
		updated_at: "2026-10-01T00:00:00Z",
		started_on: null,
		finished_on: null,
		note: "おすすめされた",
	};

	it("応答の内容を使い、送らなかったメモは前の値を残す", () => {
		const saved = { ...previous, status: "watching" as const, started_on: "2026-10-30" };
		const { note: _note, ...withoutNote } = saved;
		expect(savedEntryFromResult({ entry: withoutNote }, form({}), previous)).toEqual(saved);
	});

	it("応答に内容が無ければフォームから組み立て、日付とメモは前の値を残す", () => {
		const entry = savedEntryFromResult(undefined, form({ status: "watching", score: "", progress: "1" }), previous);
		expect(entry).toMatchObject({ status: "watching", progress: 1, note: "おすすめされた", started_on: null });
	});
});
