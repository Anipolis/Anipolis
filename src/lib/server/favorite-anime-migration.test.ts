import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_FAVORITE_ANIME } from "$lib/favorite-anime";

const migration = readFileSync(new URL("../../../supabase/migrations/178_favorite_anime.sql", import.meta.url), "utf8");

function policyBody(name: string) {
	const start = migration.indexOf(`CREATE POLICY "${name}"`);
	expect(start).toBeGreaterThanOrEqual(0);
	const end = migration.indexOf(");", start);
	return migration.slice(start, end);
}

describe("ベスト作品の migration（#361）", () => {
	it("見える相手は投稿と同じ判定（鍵アカウント・ブロック・BAN）にする", () => {
		const body = policyBody("user_favorite_anime: 投稿と同じ相手に見せる");
		expect(body).toContain("FOR SELECT");
		expect(body).toContain("public.can_view_profile_content(user_id)");
		// マイリストの公開設定には連動させない
		expect(body).not.toContain("list_is_public");
	});

	it("追加は本人だけ。β権限とアカウント状態の両方を求める", () => {
		const body = policyBody("user_favorite_anime: 自分のみ追加可能");
		expect(body).toContain("FOR INSERT");
		expect(body).toContain("auth.uid() = user_id");
		expect(body).toContain("public.has_beta_write_access()");
		expect(body).toContain("public.is_profile_active_for_writes(user_id)");
	});

	it("削除は本人だけ", () => {
		const body = policyBody("user_favorite_anime: 自分のみ削除可能");
		expect(body).toContain("FOR DELETE");
		expect(body).toContain("auth.uid() = user_id");
	});

	it("件数の上限をアプリと DB でそろえる", () => {
		expect(migration).toContain(`CHECK (position BETWEEN 0 AND ${MAX_FAVORITE_ANIME - 1})`);
		expect(migration).toContain(`cardinality(ids) > ${MAX_FAVORITE_ANIME}`);
		expect(migration).toContain("UNIQUE (user_id, position)");
	});

	it("保存は呼んだ人の権限で動き、読めない作品を断る", () => {
		expect(migration).toContain("SECURITY INVOKER");
		expect(migration).not.toContain("SECURITY DEFINER");
		expect(migration).toContain("SELECT count(*) INTO readable_count FROM public.anime WHERE id = ANY (ids)");
		expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.set_favorite_anime\(bigint\[\]\) FROM PUBLIC, anon;/);
	});
});
