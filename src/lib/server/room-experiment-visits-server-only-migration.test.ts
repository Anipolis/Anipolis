import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/172_room_experiment_visits_server_only.sql", import.meta.url),
	"utf8",
);

describe("room experiment visits server-only migration (172, #239)", () => {
	it("本人による直接 INSERT のポリシーを外し、利用者の書き込み権限も外す", () => {
		expect(migration).toContain(
			'DROP POLICY IF EXISTS "room_experiment_visits_insert_own" ON public.room_experiment_visits;',
		);
		expect(migration).toContain(
			"REVOKE INSERT, UPDATE, DELETE ON public.room_experiment_visits FROM anon, authenticated;",
		);
	});

	it("読み取りのポリシーには触らない（退出アンケートの INSERT ポリシーが頼っている）", () => {
		expect(migration).not.toMatch(/DROP POLICY[^;]*select_own_or_admin/);
		expect(migration).not.toMatch(/REVOKE[^;]*SELECT/);
	});

	it("CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
