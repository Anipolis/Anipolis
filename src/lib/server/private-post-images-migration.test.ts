import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/151_private_post_images.sql", import.meta.url),
	"utf8",
);

describe("private post images migration (151, #316)", () => {
	it("post-images を非公開にし、誰でも読める読み取りポリシーを外す", () => {
		expect(migration).toContain("UPDATE storage.buckets SET public = false WHERE id = 'post-images'");
		expect(migration).toContain('DROP POLICY IF EXISTS "post-images are publicly accessible" ON storage.objects');
	});

	it("読み取りは本人のフォルダだけ（他人の画像は読めない）", () => {
		expect(migration).toMatch(
			/CREATE POLICY "users can read their own post images"\s+ON storage\.objects FOR SELECT\s+TO authenticated\s+USING \(\s+bucket_id = 'post-images'\s+AND auth\.uid\(\)::text = \(storage\.foldername\(name\)\)\[1\]/,
		);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
