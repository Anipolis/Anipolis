import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../../supabase/migrations/192_collection_kinds.sql", import.meta.url), "utf8");

describe("コレクションの種類と段（192）", () => {
	it("種類は3つに限り、段は1〜10段・名前は1〜10文字にする", () => {
		expect(sql).toContain("CHECK (kind IN ('list', 'ranking', 'tier'))");
		expect(sql).toContain("cardinality(p_tiers) BETWEEN 1 AND 10");
		expect(sql).toContain("char_length(btrim(label)) NOT BETWEEN 1 AND 10");
		expect(sql).toContain("GRANT UPDATE (kind, tiers) ON public.user_collections TO authenticated;");
	});

	it("段を渡さない保存では、残る作品の段を引き継ぐ", () => {
		expect(sql).toContain("p_tiers smallint[] DEFAULT NULL");
		expect(sql).toContain("WHEN p_tiers IS NULL THEN previous_tiers[array_position(previous_ids, picked.id)]");
	});

	it("段を減らしたら無くなった段の作品を未分類に戻す（作品の行は持ち主の権限で直す）", () => {
		expect(sql).toMatch(/reset_removed_collection_tiers\(\)[\s\S]*?SECURITY DEFINER/);
		expect(sql).toContain("WHERE collection_id = NEW.id AND tier >= cardinality(NEW.tiers)");
	});
});
