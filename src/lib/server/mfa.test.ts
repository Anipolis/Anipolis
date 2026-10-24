import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getAssuranceLevel, isMfaExemptPath, isTotpCodeShape, needsMfaChallenge, normalizeTotpCode } from "./mfa";
import { isAdminUser } from "./queries";

type Level = { currentLevel: string | null; nextLevel: string | null };

function makeSupabase(options: { level: Level | null; isAdmin: boolean }) {
	return {
		auth: {
			mfa: {
				getAuthenticatorAssuranceLevel: vi.fn(async () =>
					options.level
						? { data: options.level, error: null }
						: { data: null, error: new Error("no session") },
				),
			},
		},
		from: vi.fn(() => ({
			select: () => ({
				eq: () => ({ maybeSingle: async () => ({ data: { is_admin: options.isAdmin }, error: null }) }),
			}),
		})),
	} as unknown as Parameters<typeof isAdminUser>[0];
}

describe("二段階認証のヘルパー", () => {
	it("設定済みでコード未入力（aal1 → aal2）のときだけコードを求める", () => {
		expect(needsMfaChallenge({ current: "aal1", next: "aal2" })).toBe(true);
		expect(needsMfaChallenge({ current: "aal2", next: "aal2" })).toBe(false);
		expect(needsMfaChallenge({ current: "aal1", next: "aal1" })).toBe(false);
		expect(needsMfaChallenge({ current: null, next: null })).toBe(false);
	});

	it("確かさが読めないとき・知らない値のときは null にする", async () => {
		expect(await getAssuranceLevel(makeSupabase({ level: null, isAdmin: false }) as never)).toEqual({
			current: null,
			next: null,
		});
		expect(
			await getAssuranceLevel(
				makeSupabase({ level: { currentLevel: "aal3", nextLevel: "aal2" }, isAdmin: false }) as never,
			),
		).toEqual({ current: null, next: "aal2" });
	});

	it("コードは全角数字・空白を直してから 6 桁か確かめる", () => {
		expect(normalizeTotpCode("１２３ ４５６")).toBe("123456");
		expect(isTotpCodeShape("123456")).toBe(true);
		expect(isTotpCodeShape("12345")).toBe(false);
		expect(isTotpCodeShape("12345a")).toBe(false);
	});

	it("ログイン・コード入力・規約・API の画面はコード入力に回さない", () => {
		expect(isMfaExemptPath("/auth")).toBe(true);
		expect(isMfaExemptPath("/auth/mfa")).toBe(true);
		expect(isMfaExemptPath("/terms")).toBe(true);
		expect(isMfaExemptPath("/api/posts")).toBe(true);
		expect(isMfaExemptPath("/")).toBe(false);
		expect(isMfaExemptPath("/admin")).toBe(false);
		expect(isMfaExemptPath("/authors")).toBe(false);
	});
});

describe("isAdminUser（管理者は二段階認証済みのログインだけ）", () => {
	it("管理者でも、パスワードだけのログイン（aal1）は管理者として扱わない", async () => {
		const supabase = makeSupabase({ level: { currentLevel: "aal1", nextLevel: "aal2" }, isAdmin: true });
		expect(await isAdminUser(supabase, "user-1")).toBe(false);
	});

	it("管理者で二段階認証済み（aal2）なら管理者として扱う", async () => {
		const supabase = makeSupabase({ level: { currentLevel: "aal2", nextLevel: "aal2" }, isAdmin: true });
		expect(await isAdminUser(supabase, "user-1")).toBe(true);
	});

	it("管理者でない人は aal2 でも管理者として扱わない", async () => {
		const supabase = makeSupabase({ level: { currentLevel: "aal2", nextLevel: "aal2" }, isAdmin: false });
		expect(await isAdminUser(supabase, "user-1")).toBe(false);
	});
});

describe("admin requires mfa migration (177)", () => {
	const migration = readFileSync(
		new URL("../../../supabase/migrations/177_admin_requires_mfa.sql", import.meta.url),
		"utf8",
	);
	const statements = migration
		.split("\n")
		.filter((line) => !line.startsWith("--"))
		.join("\n");

	it("is_current_user_admin は aal2 のときだけ true", () => {
		expect(statements).toContain("CREATE OR REPLACE FUNCTION public.is_current_user_admin()");
		expect(statements).toContain("COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'");
		expect(statements).toContain("SECURITY DEFINER");
	});

	it("profiles.is_admin を直接見ていたポリシーを関数に置き換える", () => {
		for (const policy of [
			"admin_audit_logs_insert_admin",
			"admin_audit_logs_select_admin",
			"reports_select_own_or_admin",
			"reports_update_admin",
		]) {
			expect(statements).toContain(`DROP POLICY IF EXISTS ${policy}`);
			expect(statements).toContain(`CREATE POLICY ${policy}`);
		}
		// ポリシーの部分（最初の DROP POLICY から後）には is_admin の直接の参照を残さない
		expect(statements.slice(statements.indexOf("DROP POLICY"))).not.toContain("is_admin = true");
	});
});
