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

-- ----------------------------------------------------------------
-- フォロー中タイムライン（127）: ミュートした人の投稿とリポストを、重複を除く前に外す
-- ----------------------------------------------------------------
-- 127 は同じ投稿のイベントのうち最新の1件だけを残す。ミュートした人のリポストが最新だと、
-- 元の投稿や他の人のリポストが残らず、アプリ側で外すと投稿ごと消えていた。
-- 定義は 127 のまま、イベントの候補からミュートした人を外す条件だけを足す。

CREATE OR REPLACE FUNCTION public.get_following_timeline(
    p_limit integer DEFAULT 50,
    p_before timestamptz DEFAULT NULL,
    p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
    post_id uuid,
    timeline_created_at timestamptz,
    repost_user_id uuid,
    reposted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH events AS (
        -- フォロー中ユーザー自身のトップレベル投稿
        SELECT
            p.id AS post_id,
            p.created_at AS timeline_created_at,
            NULL::uuid AS repost_user_id,
            NULL::timestamptz AS reposted_at,
            0 AS event_kind
        FROM public.follows f
        JOIN public.posts p ON p.user_id = f.following_id
        WHERE f.follower_id = auth.uid()
          AND p.parent_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.user_mutes m
              WHERE m.muter_id = auth.uid() AND m.muted_id = p.user_id
          )

        UNION ALL

        -- フォロー中ユーザーによるリポスト。対象投稿の RLS は reposts の既存
        -- select policy により検証されるため、閲覧不能な投稿IDは返らない。
        SELECT
            r.post_id,
            r.created_at AS timeline_created_at,
            r.user_id AS repost_user_id,
            r.created_at AS reposted_at,
            1 AS event_kind
        FROM public.follows f
        JOIN public.reposts r ON r.user_id = f.following_id
        WHERE f.follower_id = auth.uid()
          AND NOT EXISTS (
              SELECT 1 FROM public.user_mutes m
              WHERE m.muter_id = auth.uid() AND m.muted_id = r.user_id
          )
    ),
    deduplicated AS (
        -- 同じ投稿を複数のフォロー中ユーザーがリポストしていても、最も新しい
        -- イベントだけを残す。投稿と同時刻なら従来のクライアント側処理と同じく
        -- 投稿本体を優先する。
        SELECT DISTINCT ON (post_id)
            post_id,
            timeline_created_at,
            repost_user_id,
            reposted_at
        FROM events
        ORDER BY post_id, timeline_created_at DESC, event_kind ASC
    )
    SELECT
        post_id,
        timeline_created_at,
        repost_user_id,
        reposted_at
    FROM deduplicated
    -- 重複を除外した後でカーソルを適用する。先のページに出た投稿の古い
    -- リポストイベントを後続ページへ再登場させないための順序である。
    WHERE p_before IS NULL
       OR timeline_created_at < p_before
       OR (
            p_before_id IS NOT NULL
            AND timeline_created_at = p_before
            AND post_id < p_before_id
       )
    ORDER BY timeline_created_at DESC, post_id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_following_timeline(integer, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_following_timeline(integer, timestamptz, uuid) TO authenticated;
