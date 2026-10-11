import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../supabase/migrations/141_user_blocks.sql", import.meta.url), "utf8");
const fixMigration = readFileSync(
	new URL("../../../supabase/migrations/143_fix_block_write_checks.sql", import.meta.url),
	"utf8",
);

describe("user blocks migration", () => {
	it("keeps blocks self-scoped: 自分の行だけ読め、相手にはブロックを知らせない", () => {
		expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.user_blocks");
		expect(migration).toContain("CONSTRAINT user_blocks_no_self_block CHECK (blocker_id <> blocked_id)");
		expect(migration).toContain("ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY");
		expect(migration).toMatch(/CREATE POLICY "user_blocks_select_own"[\s\S]*?USING \(auth\.uid\(\) = blocker_id\)/);
		expect(migration).toMatch(/CREATE POLICY "user_blocks_insert_own"[\s\S]*?auth\.uid\(\) = blocker_id/);
		expect(migration).toMatch(/CREATE POLICY "user_blocks_delete_own"[\s\S]*?USING \(auth\.uid\(\) = blocker_id\)/);
	});

	it("判定関数は双方向で、SELECT ポリシーを越えて読めるよう SECURITY DEFINER にする", () => {
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.is_blocked_between(user_a uuid, user_b uuid)");
		expect(migration).toMatch(/is_blocked_between[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/);
		expect(migration).toMatch(/b\.blocker_id = user_a AND b\.blocked_id = user_b/);
		expect(migration).toMatch(/b\.blocker_id = user_b AND b\.blocked_id = user_a/);
		// 自分自身・NULL ではブロック扱いにしない
		expect(migration).toMatch(/user_a IS NULL OR user_b IS NULL OR user_a = user_b THEN false/);
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_blocked_user_ids()");
		expect(migration).toMatch(/get_blocked_user_ids[\s\S]*?SECURITY DEFINER/);
	});

	it("can_view_profile_content にブロック検査を足し、既存の条件を落とさない", () => {
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.can_view_profile_content(profile_id uuid)");
		expect(migration).toContain("AND NOT public.is_blocked_between(auth.uid(), profile_id)");
		// 039 の条件（BAN・鍵アカ・フォロワー・管理者）が残っていること
		expect(migration).toMatch(/am\.status != 'banned'/);
		expect(migration).toMatch(/p\.is_private = false/);
		expect(migration).toMatch(/f\.follower_id = auth\.uid\(\)/);
		expect(migration).toMatch(/public\.is_current_user_admin\(\)/);
	});

	it("can_view_profile_content を通らない書き込み経路にもブロックを入れる", () => {
		// 返信・引用の相手
		expect(migration).toMatch(
			/CREATE POLICY "posts_insert_active_users"[\s\S]*?parent\.id = parent_id[\s\S]*?is_blocked_between/,
		);
		expect(migration).toMatch(
			/CREATE POLICY "posts_insert_active_users"[\s\S]*?quoted\.id = quoted_post_id[\s\S]*?is_blocked_between/,
		);
		// フォロー・フォロー申請・ブックマーク
		expect(migration).toMatch(
			/CREATE POLICY "follows_insert_active_users"[\s\S]*?NOT public\.is_blocked_between\(follower_id, following_id\)/,
		);
		expect(migration).toMatch(
			/CREATE POLICY "follow_requests_insert_active_users"[\s\S]*?NOT public\.is_blocked_between\(requester_id, target_id\)/,
		);
		expect(migration).toMatch(/CREATE POLICY "bookmarks_insert_active_users"[\s\S]*?is_blocked_between/);
		// β・アカウント状態の既存ガードを落としていない
		expect(migration).toMatch(/posts_insert_active_users[\s\S]*?is_profile_active_for_writes\(user_id\)/);
		expect(migration).toMatch(/posts_insert_active_users[\s\S]*?has_beta_write_access\(\)/);
	});

	it("ブロック時に既存のフォロー・申請・未読通知を同じトランザクションで解除する", () => {
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.sever_relationship_on_block()");
		expect(migration).toMatch(/DELETE FROM public\.follows[\s\S]*?follower_id = NEW\.blocked_id/);
		expect(migration).toMatch(/DELETE FROM public\.follow_requests[\s\S]*?requester_id = NEW\.blocked_id/);
		// 既読の通知は履歴として残す
		expect(migration).toMatch(/DELETE FROM public\.notifications\s*\n\s*WHERE NOT read/);
		expect(migration).toContain("AFTER INSERT ON public.user_blocks");
	});

	it("行の INSERT が止まらない通知経路（メンション・マイリスト）を個別に除外する", () => {
		expect(migration).toMatch(
			/notify_on_mention[\s\S]*?NOT public\.is_blocked_between\(NEW\.user_id, mentioned_user_id\)/,
		);
		expect(migration).toMatch(
			/notify_on_mylist_status[\s\S]*?NOT public\.is_blocked_between\(NEW\.user_id, f\.follower_id\)/,
		);
		// 126 で入れた search_path の固定を維持する
		expect(migration).toMatch(/notify_on_mention[\s\S]*?SECURITY DEFINER SET search_path = public/);
		expect(migration).toMatch(/notify_on_mylist_status[\s\S]*?SECURITY DEFINER SET search_path = public/);
	});

	it("反応ユーザー一覧は投稿の可視性に加えて各ユーザーも除外する", () => {
		expect(migration).toMatch(
			/FROM public\.likes l[\s\S]*?NOT public\.is_blocked_between\(auth\.uid\(\), l\.user_id\)/,
		);
		expect(migration).toMatch(
			/FROM public\.reposts r[\s\S]*?NOT public\.is_blocked_between\(auth\.uid\(\), r\.user_id\)/,
		);
		// 126 で閉じた「未ログインでいいね一覧が見える」穴を戻していない
		expect(migration).toMatch(/auth\.uid\(\) IS NULL OR post_author_id IS DISTINCT FROM auth\.uid\(\)/);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});

describe("block write checks fix migration (143)", () => {
	it("投稿者の判定は SELECT RLS に依存しないよう SECURITY DEFINER で行う", () => {
		expect(fixMigration).toContain(
			"CREATE OR REPLACE FUNCTION public.is_blocked_with_post_author(target_post_id uuid)",
		);
		expect(fixMigration).toMatch(
			/is_blocked_with_post_author[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/,
		);
		expect(fixMigration).toMatch(/WHEN target_post_id IS NULL THEN false/);
		expect(fixMigration).toMatch(/p\.id = target_post_id[\s\S]*?is_blocked_between\(auth\.uid\(\), p\.user_id\)/);
	});

	it("返信・引用・ブックマークは挿入行の列を helper に渡して検査する", () => {
		expect(fixMigration).toMatch(
			/CREATE POLICY "posts_insert_active_users"[\s\S]*?NOT public\.is_blocked_with_post_author\(parent_id\)[\s\S]*?NOT public\.is_blocked_with_post_author\(quoted_post_id\)/,
		);
		expect(fixMigration).toMatch(
			/CREATE POLICY "bookmarks_insert_active_users"[\s\S]*?NOT public\.is_blocked_with_post_author\(post_id\)/,
		);
		// 呼び出し元の権限で posts を読むサブクエリに戻していない
		expect(fixMigration).not.toMatch(/WITH CHECK \([^;]*FROM public\.posts/);
		// β・アカウント状態の既存ガードを落としていない
		expect(fixMigration).toMatch(/posts_insert_active_users[\s\S]*?is_profile_active_for_writes\(user_id\)/);
		expect(fixMigration).toMatch(/posts_insert_active_users[\s\S]*?has_beta_write_access\(\)/);
		expect(fixMigration).toMatch(/bookmarks_insert_active_users[\s\S]*?is_profile_active_for_writes\(user_id\)/);
		expect(fixMigration).toMatch(/bookmarks_insert_active_users[\s\S]*?has_beta_write_access\(\)/);
	});

	it("返信通知もブロック相手には作らない", () => {
		expect(fixMigration).toMatch(
			/CREATE OR REPLACE FUNCTION public\.notify_on_reply\(\)[\s\S]*?NOT public\.is_blocked_between\(NEW\.user_id, post_author_id\)/,
		);
		expect(fixMigration).toMatch(/notify_on_reply[\s\S]*?SECURITY DEFINER SET search_path = public/);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(fixMigration).not.toMatch(/CONCURRENTLY/i);
	});
});
