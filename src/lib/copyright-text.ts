// ページ本文から © を拾うときの行の扱い。© 収集系のスクリプトで共有する。

// 権利者の区切りで終わる行は、改行（<br> など）で表記が折り返されている
const CONTINUES_ON_NEXT_LINE = /[／/・･、，,＆&]$/;
const MAX_JOINED_LINES = 3;

/**
 * 「©くろかた／MFブックス／<br>「治癒魔法の間違った使い方」製作委員会」のように、
 * 区切り記号の直後で改行された © を1行に戻す。行単位で © を拾う処理が、改行より
 * 後ろの「…製作委員会」を落としていた。空行は無視し、続きは最大3行までつなぐ。
 */
export function joinWrappedCopyrightLines(lines: readonly string[]): string[] {
	const trimmed = lines.map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length > 0);
	const joined: string[] = [];
	for (let index = 0; index < trimmed.length; index += 1) {
		let line = trimmed[index] as string;
		let added = 0;
		while (CONTINUES_ON_NEXT_LINE.test(line) && index + 1 < trimmed.length && added < MAX_JOINED_LINES) {
			index += 1;
			added += 1;
			line = `${line}${trimmed[index]}`;
		}
		joined.push(line);
	}
	return joined;
}
