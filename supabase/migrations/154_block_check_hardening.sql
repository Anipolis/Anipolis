-- ============================================================
-- 154_block_check_hardening: ブロックの判定を当事者に限り、おすすめ送信にも DB で効かせる
--   （master リリース PR #383 の Codex レビュー）
-- ============================================================
-- 1) is_blocked_between(user_a, user_b)（141）は SECURITY DEFINER で任意の2人を受け取り、anon にも
--    実行権限があった。未ログインのクライアントが RPC を直接呼べば、ユーザー ID の組ごとにブロックの
--    有無を調べられ、user_blocks の SELECT ポリシー（相手にはブロックされた事実を見せない）を迂回できた。
--    クライアント（JWT の role が anon / authenticated）からの呼び出しでは、呼び出した本人が当事者の組
--    だけを判定し、それ以外は false を返す。
--      * RLS・トリガー・関数の呼び出し箇所（141 / 143 / 146）はどれも auth.uid() か、auth.uid() と
--        一致することを同じ条件で確かめた列（follower_id / requester_id / 投稿者）を当事者に含むので、
--        判定は変わらない
--      * service role とシステムの処理（JWT の無い pg_cron など）は今どおり任意の組を判定できる
--
-- 2) おすすめ（anime_recommendations）のブロック検査はアプリのサーバー処理にしかなく、REST へ直接
--    INSERT すれば迂回でき、ブロックした相手に推薦の通知も届いた。INSERT ポリシーにも検査を足す
--    （130 のポリシーに条件を一つ足すだけ）。

CREATE OR REPLACE FUNCTION public.is_blocked_between(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN user_a IS NULL OR user_b IS NULL OR user_a = user_b THEN false
        -- クライアントからは、呼び出した本人が当事者の組だけ
        WHEN COALESCE(auth.role(), '') IN ('anon', 'authenticated')
             AND auth.uid() IS DISTINCT FROM user_a
             AND auth.uid() IS DISTINCT FROM user_b THEN false
        ELSE EXISTS (
            SELECT 1
            FROM public.user_blocks b
            WHERE (b.blocker_id = user_a AND b.blocked_id = user_b)
               OR (b.blocker_id = user_b AND b.blocked_id = user_a)
        )
    END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "anime_recommendations: users can insert own recommendations"
    ON public.anime_recommendations;
CREATE POLICY "anime_recommendations: users can insert own recommendations"
    ON public.anime_recommendations FOR INSERT
    WITH CHECK (
        auth.uid() = recommender_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(recommender_id)
        AND NOT public.is_blocked_between(recommender_id, recipient_id)
    );
