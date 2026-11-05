import { isDateKey } from "$lib/utils/jst";

/** マイリストのメモの上限（DB の user_anime_notes_body_length と同じ） */
export const MYLIST_NOTE_MAX_LENGTH = 1000;

type WatchDates = { started_on?: string | null; finished_on?: string | null };

/**
 * 見始めた日・見終えた日を解釈する（180）。フォームに欄が無ければ何も返さず、保存でも触らない
 * （アニメ一覧の小さい欄など、日付を送らない保存がある）。空欄は日付を消す。
 * 未来の日付と、見終えた日が見始めた日より前の組み合わせは受け付けない。
 */
export function parseWatchDates(
	form: FormData,
	today: string,
): { ok: true; values: WatchDates } | { ok: false; message: string } {
	const values: WatchDates = {};
	for (const key of ["started_on", "finished_on"] as const) {
		if (!form.has(key)) continue;
		const raw = form.get(key);
		if (typeof raw !== "string") return { ok: false, message: "日付の形式が正しくありません" };
		const value = raw.trim();
		if (value === "") {
			values[key] = null;
			continue;
		}
		if (!isDateKey(value)) return { ok: false, message: "日付の形式が正しくありません" };
		if (value > today) return { ok: false, message: "今日より後の日付は入れられません" };
		values[key] = value;
	}
	if (values.started_on && values.finished_on && values.started_on > values.finished_on) {
		return { ok: false, message: "見終えた日は、見始めた日と同じかそれより後にしてください" };
	}
	return { ok: true, values };
}

/**
 * メモを解釈する（180）。欄が無ければ undefined（保存で触らない）、空なら null（メモを消す）。
 * 改行は \n にそろえ、前後の空白を落とす。
 */
export function parseMylistNote(
	form: FormData,
): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
	if (!form.has("note")) return { ok: true, value: undefined };
	const raw = form.get("note");
	if (typeof raw !== "string") return { ok: false, message: "メモの形式が正しくありません" };
	const value = raw.replace(/\r\n?/g, "\n").trim();
	if (value === "") return { ok: true, value: null };
	if ([...value].length > MYLIST_NOTE_MAX_LENGTH) {
		return { ok: false, message: `メモは${MYLIST_NOTE_MAX_LENGTH}文字までです` };
	}
	return { ok: true, value };
}
