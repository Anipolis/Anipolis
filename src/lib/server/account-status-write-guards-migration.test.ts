import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/130_account_status_write_guards.sql", import.meta.url),
	"utf8",
);

function policyBody(name: string) {
	const start = migration.indexOf(`CREATE POLICY "${name}"`);
	expect(start).toBeGreaterThanOrEqual(0);
	const end = migration.indexOf(");", start);
	return migration.slice(start, end);
}

function functionBody(signature: string) {
	const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${signature}`);
	expect(start).toBeGreaterThanOrEqual(0);
	const end = migration.indexOf("$$ LANGUAGE plpgsql", start);
	expect(end).toBeGreaterThan(start);
	return migration.slice(start, end);
}

describe("account status write guards migration (#232, #233)", () => {
	it.each([
		{ name: "user_anime_list: 自分のみ編集可能", owner: "user_id", command: "INSERT" },
		{ name: "user_anime_list: 自分のみ更新可能", owner: "user_id", command: "UPDATE" },
		{
			name: "anime_recommendations: users can insert own recommendations",
			owner: "recommender_id",
			command: "INSERT",
		},
		{ name: "reports_insert_own", owner: "reporter_id", command: "INSERT" },
	])("requires both beta access and an active account in $name", ({ name, owner, command }) => {
		expect(migration).toContain(`DROP POLICY IF EXISTS "${name}"`);
		const body = policyBody(name);
		expect(body).toContain(`FOR ${command}`);
		expect(body).toContain(`auth.uid() = ${owner}`);
		expect(body).toContain("public.has_beta_write_access()");
		expect(body).toContain(`public.is_profile_active_for_writes(${owner})`);
	});

	it("keeps the mylist update policy scoped to the owner's own rows", () => {
		const body = policyBody("user_anime_list: 自分のみ更新可能");
		expect(body).toMatch(/USING \(auth\.uid\(\) = user_id\)/);
	});

	it("rejects restricted accounts inside create_invite before any invite is generated", () => {
		const body = functionBody("create_invite(");
		const loginCheck = body.indexOf("RAISE EXCEPTION 'login required'");
		const statusCheck = body.indexOf("IF NOT public.is_profile_active_for_writes(current_user_id) THEN");
		const codeLoop = body.indexOf("LOOP");
		expect(loginCheck).toBeGreaterThan(-1);
		expect(statusCheck).toBeGreaterThan(loginCheck);
		expect(statusCheck).toBeLessThan(codeLoop);
		expect(body).toContain("USING DETAIL = 'INVITE_ACCOUNT_RESTRICTED'");
		// 116 のβ検査はそのまま残す
		expect(body).toContain("USING DETAIL = 'INVITE_FORBIDDEN'");
		expect(body).toContain("USING DETAIL = 'INVITE_CREATE_LIMIT'");
	});

	it("rejects non-beta and restricted accounts inside create_anime_exchange before validation and writes", () => {
		const body = functionBody("create_anime_exchange(");
		const loginCheck = body.indexOf("RAISE EXCEPTION 'login required'");
		const betaCheck = body.indexOf("IF NOT public.has_beta_write_access() THEN");
		const statusCheck = body.indexOf("IF NOT public.is_profile_active_for_writes(current_user_id) THEN");
		const firstValidation = body.indexOf("RAISE EXCEPTION 'comment too long'");
		expect(betaCheck).toBeGreaterThan(loginCheck);
		expect(statusCheck).toBeGreaterThan(betaCheck);
		expect(firstValidation).toBeGreaterThan(statusCheck);
		expect(body).toContain("USING DETAIL = 'ANIME_EXCHANGE_FORBIDDEN'");
		expect(body).toContain("USING DETAIL = 'ANIME_EXCHANGE_ACCOUNT_RESTRICTED'");
		// 111 の本体（マッチ通知・待機ガード）は維持され、両 RPC とも SECURITY DEFINER + search_path 固定のまま
		expect(body).toContain("anime exchange rejected");
		const footer = `$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`;
		expect(migration.split(footer)).toHaveLength(3);
	});

	it("revokes PUBLIC and anon execute on both RPCs and grants only the needed roles", () => {
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.create_anime_exchange(bigint, text, text[]) FROM PUBLIC, anon;",
		);
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.create_anime_exchange(bigint, text, text[]) TO authenticated, service_role;",
		);
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.create_invite(integer, timestamptz) FROM PUBLIC, anon;",
		);
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.create_invite(integer, timestamptz) TO authenticated, service_role;",
		);
		expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION [^\n]* TO authenticated;\s*$/m);
	});

	it("documents that personal-only settings intentionally keep the beta guard alone", () => {
		expect(migration).toContain("muted_words");
		expect(migration).not.toContain('CREATE POLICY "muted_words');
	});
});
