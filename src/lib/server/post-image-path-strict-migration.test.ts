import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/167_post_image_path_strict.sql", import.meta.url),
	"utf8",
);

// トリガーの正規表現（'<前半>' || NEW.user_id::text || '<後半>'）を取り出し、JavaScript で同じ判定をする。
// 使っている書き方（文字クラス・\.・^$）は POSIX と JavaScript で意味が同じ
const match = migration.match(/image\.url !~ \(\s*'([^']+)'\s*\|\|\s*NEW\.user_id::text\s*\|\|\s*'([^']+)'/);
const [, prefix = "", suffix = ""] = match ?? [];
const USER_ID = "eeb719eb-bbfc-4b82-a624-3e7f7a33668c";
const OTHER_ID = "11111111-2222-4333-8444-555555555555";
const accepted = (url: string) => new RegExp(prefix + USER_ID + suffix).test(url) && !url.includes("..");
const ORIGIN = "https://jxrfsbhluooyrkrooger.supabase.co/storage/v1/object/public/post-images/";

describe("post image path strict migration (167, #235)", () => {
	it("トリガーの正規表現を読み取れる", () => {
		expect(match).not.toBeNull();
	});

	it("アップロード API が返す形の URL は通す", () => {
		expect(accepted(`${ORIGIN}${USER_ID}/1790695034425-dec6ac84-6eeb-42a1-baf3-984b1519bdbf.png`)).toBe(true);
	});

	it("外部のオリジン・http・他人のフォルダは拒否する", () => {
		expect(accepted(`https://evil.example/storage/v1/object/public/post-images/${USER_ID}/a.png`)).toBe(false);
		expect(
			accepted(`https://evil.example/?x=.supabase.co/storage/v1/object/public/post-images/${USER_ID}/a.png`),
		).toBe(false);
		expect(
			accepted(`http://jxrfsbhluooyrkrooger.supabase.co/storage/v1/object/public/post-images/${USER_ID}/a.png`),
		).toBe(false);
		expect(accepted(`${ORIGIN}${OTHER_ID}/a.png`)).toBe(false);
	});

	it("URL エンコード・サブフォルダ・クエリ付き・.. は拒否する", () => {
		expect(accepted(`${ORIGIN}${USER_ID}/%2e%2e/${OTHER_ID}/a.png`)).toBe(false);
		expect(accepted(`${ORIGIN}${USER_ID}/..%2F${OTHER_ID}%2Fa.png`)).toBe(false);
		expect(accepted(`${ORIGIN}${USER_ID}/sub/a.png`)).toBe(false);
		expect(accepted(`${ORIGIN}${USER_ID}/a.png?download=1`)).toBe(false);
		expect(accepted(`${ORIGIN}${USER_ID}/..`)).toBe(false);
	});

	it("148 のトリガーを置き換える関数だけを定義し、CONCURRENTLY を含めない", () => {
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.enforce_post_image_ownership()");
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
