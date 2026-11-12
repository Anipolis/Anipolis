import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
const hashtags = read("198_post_hashtags_select_visible_posts.sql");
const replies = read("199_post_reply_quote_visible_target.sql");
const reposts = read("200_reposts_select_visible_reposter.sql");

const VISIBLE_POST =
	/EXISTS \(\s+SELECT 1\s+FROM public\.posts p\s+WHERE p\.id = post_id\s+AND public\.can_view_profile_content\(p\.user_id\)\s+AND \(NOT p\.hidden_by_admin OR public\.is_current_user_admin\(\)\)\s+\)/;

/** 作り直す前に、その表・その操作のポリシーをすべて外していること（permissive は OR になるため） */
function expectDropsAllPolicies(sql: string, table: string, command: "a" | "r", createdPolicy: string) {
	const drop = sql.indexOf(`EXECUTE format('DROP POLICY %I ON public.${table}', policy_name)`);
	expect(drop).toBeGreaterThan(-1);
	expect(sql).toMatch(new RegExp(`WHERE polrelid = 'public\\.${table}'::regclass\\s+AND polcmd = '${command}'`));
	expect(drop).toBeLessThan(sql.indexOf(`CREATE POLICY "${createdPolicy}"`));
	expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);
}

describe("198 post_hashtags select", () => {
	it("投稿を読める人だけが、投稿とタグのつながりを読める", () => {
		expect(hashtags).toMatch(
			/CREATE POLICY "post_hashtags_select_visible_posts"\s+ON public\.post_hashtags FOR SELECT/,
		);
		expect(hashtags).toMatch(VISIBLE_POST);
		expect(hashtags.replace(/^--.*$/gm, "")).not.toMatch(/USING \(true\)/);
		expectDropsAllPolicies(hashtags, "post_hashtags", "r", "post_hashtags_select_visible_posts");
	});
});

describe("199 reply / quote target", () => {
	it("can_view_post は呼んだ人の権限で posts を読む（SELECT ポリシーがそのまま効く）", () => {
		expect(replies).toMatch(
			/CREATE OR REPLACE FUNCTION public\.can_view_post\(target_post_id uuid\)\s+RETURNS boolean\s+LANGUAGE sql\s+STABLE\s+SECURITY INVOKER\s+SET search_path = public/,
		);
		expect(replies).toMatch(
			/SELECT target_post_id IS NULL\s+OR EXISTS \(\s+SELECT 1\s+FROM public\.posts p\s+WHERE p\.id = target_post_id\s+\)/,
		);
		expect(replies.replace(/^--.*$/gm, "")).not.toContain("SECURITY DEFINER");
	});

	it("返信先・引用元を読めることを INSERT の条件に足し、143 の条件を落とさない", () => {
		const policy = /CREATE POLICY "posts_insert_active_users"[\s\S]*?;/.exec(replies)?.[0] ?? "";
		expect(policy).toContain("AND public.can_view_post(parent_id)");
		expect(policy).toContain("AND public.can_view_post(quoted_post_id)");
		expect(policy).toContain("auth.uid() = user_id");
		expect(policy).toContain("AND public.is_profile_active_for_writes(user_id)");
		expect(policy).toContain("AND public.has_beta_write_access()");
		expect(policy).toContain("AND NOT public.is_blocked_with_post_author(parent_id)");
		expect(policy).toContain("AND NOT public.is_blocked_with_post_author(quoted_post_id)");
		expectDropsAllPolicies(replies, "posts", "a", "posts_insert_active_users");
	});
});

describe("200 reposts select", () => {
	it("元の投稿に加えて、リポストした人のプロフィールを読めることを条件にする", () => {
		expect(reposts).toMatch(
			/CREATE POLICY "reposts_select_visible_posts"\s+ON public\.reposts FOR SELECT\s+USING \(\s+public\.can_view_profile_content\(user_id\)\s+AND EXISTS/,
		);
		expect(reposts).toMatch(VISIBLE_POST);
		expectDropsAllPolicies(reposts, "reposts", "r", "reposts_select_visible_posts");
	});

	it("リポストした人の一覧（SECURITY DEFINER）にも同じ条件を足し、141 の定義を落とさない", () => {
		expect(reposts).toMatch(/get_post_reaction_users\([\s\S]*?SECURITY DEFINER\s+SET search_path = public/);
		expect(reposts).toMatch(
			/FROM public\.reposts r\s+JOIN public\.profiles p ON p\.id = r\.user_id\s+WHERE r\.post_id = target_post_id\s+AND NOT public\.is_blocked_between\(auth\.uid\(\), r\.user_id\)\s+AND public\.can_view_profile_content\(r\.user_id\)/,
		);
		// いいねの一覧は投稿者本人だけ（141 のまま）
		expect(reposts).toMatch(/auth\.uid\(\) IS NULL OR post_author_id IS DISTINCT FROM auth\.uid\(\)/);
		expect(reposts).toMatch(/action_type IS NULL OR action_type NOT IN \('like', 'repost'\)/);
		expect(reposts).toContain(
			"GRANT EXECUTE ON FUNCTION public.get_post_reaction_users(uuid, text, integer, integer) TO anon, authenticated, service_role;",
		);
	});
});
