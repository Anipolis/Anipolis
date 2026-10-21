import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISALLOWED_POST_CONTROL_CHARS, normalizePostContent } from "./post-content";

describe("normalizePostContent（#245）", () => {
	it("制御文字だけの本文は空になる", () => {
		expect(normalizePostContent("\u0017")).toBe("");
		expect(normalizePostContent("\u0017\n\u0017\u0017\n")).toBe("");
		expect(normalizePostContent("\u0000\u0007\u001b\u007f\u0085\u009f")).toBe("");
	});

	it("タブと改行は残し、文字の間の制御文字だけを取り除く", () => {
		expect(normalizePostContent("1行目\n\t2行目\r\n3行目")).toBe("1行目\n\t2行目\r\n3行目");
		expect(normalizePostContent("ア\u0017ニ\u001bメ")).toBe("アニメ");
	});

	it("絵文字の結合・異体字セレクタ・結合文字は残す", () => {
		const family = "👨‍👩‍👧";
		const heart = "❤️";
		const combined = "が"; // か + 濁点（結合文字）
		expect(normalizePostContent(`${family}${heart}${combined}`)).toBe(`${family}${heart}${combined}`);
	});

	it("前後の空白を落とす", () => {
		expect(normalizePostContent("  \u0017 こんにちは \n")).toBe("こんにちは");
	});
});

describe("posts_content_no_control_chars（173）とアプリの範囲が同じ", () => {
	const migration = readFileSync(
		new URL("../../supabase/migrations/173_posts_content_no_control_chars.sql", import.meta.url),
		"utf8",
	);
	const pattern = migration.match(/CHECK \(content !~ '([^']+)'\)/)?.[1] ?? "";
	// PostgreSQL の正規表現（\xhh・\uhhhh）を JavaScript の正規表現に読み替える
	const dbRegex = new RegExp(pattern.replace(/\\x([0-9A-F]{2})/gi, "\\u00$1"), "u");

	it("DB が拒否する文字は、アプリが取り除く文字と一致する（NUL は text に入らないので除く）", () => {
		for (let code = 1; code <= 0xa0; code++) {
			const char = String.fromCodePoint(code);
			DISALLOWED_POST_CONTROL_CHARS.lastIndex = 0;
			expect([code, dbRegex.test(char)]).toEqual([code, DISALLOWED_POST_CONTROL_CHARS.test(char)]);
		}
	});

	it("既存の行は残すため NOT VALID で足し、CONCURRENTLY を含めない", () => {
		expect(migration).toMatch(/NOT VALID;/);
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
