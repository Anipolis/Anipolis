import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/148_post_image_ownership.sql", import.meta.url),
	"utf8",
);

describe("post image ownership migration (148)", () => {
	it("投稿の保存時に、すべての画像が投稿者のフォルダにあることを検査する", () => {
		expect(migration).toMatch(
			/CREATE TRIGGER enforce_post_image_ownership\s+BEFORE INSERT OR UPDATE OF image_urls, user_id ON public\.posts/,
		);
		expect(migration).toContain(
			"image.url NOT LIKE '%/storage/v1/object/public/post-images/' || NEW.user_id::text || '/%'",
		);
		expect(migration).toContain("OR image.url LIKE '%..%'");
		expect(migration).toContain("ERRCODE = '22023'");
	});

	it("バケットの公開設定には触れない（非公開化は master リリース後の別 migration）", () => {
		expect(migration).not.toMatch(/storage\.buckets/);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
