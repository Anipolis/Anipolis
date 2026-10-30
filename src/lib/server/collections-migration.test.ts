import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	MAX_COLLECTION_DESCRIPTION_LENGTH,
	MAX_COLLECTION_ITEMS,
	MAX_COLLECTION_TITLE_LENGTH,
	MAX_COLLECTIONS_PER_USER,
} from "$lib/collections";

const migration = readFileSync(new URL("../../../supabase/migrations/179_collections.sql", import.meta.url), "utf8");

function policyBody(name: string) {
	const start = migration.indexOf(`CREATE POLICY "${name}"`);
	expect(start).toBeGreaterThanOrEqual(0);
	const end = migration.indexOf(");", start);
	return migration.slice(start, end);
}

describe("コレクションの migration（#515）", () => {
	it("コレクションは本人と、公開なら投稿と同じ相手（鍵・ブロック・BAN）に見せる", () => {
		const body = policyBody("user_collections: 本人と、公開なら投稿と同じ相手に見せる");
		expect(body).toContain("FOR SELECT");
		expect(body).toContain("auth.uid() = user_id");
		expect(body).toContain("is_public AND public.can_view_profile_content(user_id)");
	});

	it("中の作品は、コレクションが見える人にだけ見せる（非公開の中身を漏らさない）", () => {
		const body = policyBody("user_collection_items: コレクションが見える人に見せる");
		expect(body).toContain("FOR SELECT");
		expect(body).toContain("EXISTS (SELECT 1 FROM public.user_collections c WHERE c.id = collection_id)");
	});

	it.each([
		["user_collections: 自分のみ作成可能", "FOR INSERT", "public.is_profile_active_for_writes(user_id)"],
		["user_collections: 自分のみ更新可能", "FOR UPDATE", "public.is_profile_active_for_writes(user_id)"],
		[
			"user_collection_items: 自分のコレクションにのみ追加可能",
			"FOR INSERT",
			"public.is_profile_active_for_writes(auth.uid())",
		],
	])("%s は本人だけ・β権限とアカウント状態を求める", (name, command, activeCheck) => {
		const body = policyBody(name);
		expect(body).toContain(command);
		expect(body).toContain("auth.uid()");
		expect(body).toContain("public.has_beta_write_access()");
		expect(body).toContain(activeCheck);
	});

	it("持ち主や作った日時は書き換えさせない（更新できる列を絞る）", () => {
		expect(migration).toContain("REVOKE ALL ON public.user_collections FROM anon, authenticated;");
		expect(migration).toContain(
			"GRANT UPDATE (title, description, is_public, updated_at) ON public.user_collections TO authenticated;",
		);
		expect(migration).not.toMatch(/GRANT [^;]*UPDATE[^;(]* ON public\.user_collection_items/);
	});

	it("上限をアプリと DB でそろえる", () => {
		expect(migration).toContain(`>= ${MAX_COLLECTIONS_PER_USER} THEN`);
		expect(migration).toContain(`cardinality(ids) > ${MAX_COLLECTION_ITEMS}`);
		expect(migration).toContain(`CHECK (position BETWEEN 0 AND ${MAX_COLLECTION_ITEMS - 1})`);
		expect(migration).toContain(`BETWEEN 1 AND ${MAX_COLLECTION_TITLE_LENGTH}`);
		expect(migration).toContain(`char_length(description) <= ${MAX_COLLECTION_DESCRIPTION_LENGTH}`);
	});

	it("作品の保存は呼んだ人の権限で動き、自分のコレクションだけ・読める作品だけを受け付ける", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.set_collection_items");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("SECURITY INVOKER");
		expect(body).toContain("WHERE id = p_collection_id AND user_id = current_user_id");
		expect(body).toContain("SELECT count(*) INTO readable_count FROM public.anime WHERE id = ANY (ids)");
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.set_collection_items(uuid, bigint[]) FROM PUBLIC, anon;",
		);
	});
});
