-- ============================================================
-- 191_user_mutes: アカウントのミュート
-- ============================================================
-- 人に対してはブロック（141）しかなく、「少し見たくないだけ」の相手にも関係を切る操作を
-- 使うしかなかった。ミュートは自分の画面から相手を外すだけで、相手には何も伝わらない。
--
-- 方針:
--   * 片方向。相手の画面・権限は何も変わらない（フォローも残す）。そのため RLS の閲覧判定
--     （can_view_profile_content）には入れず、アプリが一覧を作るときに外す。
--   * 隠すのはタイムライン・ルーム・検索・ハッシュタグの投稿とリポスト、通知、アクティビティ。
--     相手のプロフィールと、相手の投稿を直接開いたときは見える。
--   * user_mutes は本人にしか影響しない設定なので、141 と同じくβガードのみ。
--     相手にミュートされている事実は見せない（本人の行だけ読める）。

CREATE TABLE IF NOT EXISTS public.user_mutes (
    muter_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    muted_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (muter_id, muted_id),
    CONSTRAINT user_mutes_no_self_mute CHECK (muter_id <> muted_id)
);

-- 退会などで相手のプロフィールが消えたときの削除用
CREATE INDEX IF NOT EXISTS user_mutes_muted_id_idx ON public.user_mutes (muted_id);

ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_mutes_select_own" ON public.user_mutes;
CREATE POLICY "user_mutes_select_own"
    ON public.user_mutes FOR SELECT
    USING (auth.uid() = muter_id);

DROP POLICY IF EXISTS "user_mutes_insert_own" ON public.user_mutes;
CREATE POLICY "user_mutes_insert_own"
    ON public.user_mutes FOR INSERT
    WITH CHECK (
        auth.uid() = muter_id
        AND public.has_beta_write_access()
    );

DROP POLICY IF EXISTS "user_mutes_delete_own" ON public.user_mutes;
CREATE POLICY "user_mutes_delete_own"
    ON public.user_mutes FOR DELETE
    USING (auth.uid() = muter_id);

REVOKE ALL ON public.user_mutes FROM anon;
GRANT SELECT, INSERT, DELETE ON public.user_mutes TO authenticated;
GRANT ALL ON public.user_mutes TO service_role;
