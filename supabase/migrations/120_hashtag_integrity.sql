-- ハッシュタグ関連の整合性・可視性を強化する（Codex監査 P1-3）。
--
-- 1) post_hashtags の INSERT が「認証済み」だけで投稿所有者を確認しておらず、
--    他人の投稿へ任意のタグを関連付けてトレンドを操作できた。
--    投稿所有者本人（＋β資格・アカウント有効）のみに制限する。
-- 2) hashtags.name に長さ制限がなく、直接 API から巨大タグを蓄積できた。
--    CHECK 制約（NOT VALID: 既存行は検証せず新規行にのみ適用）を追加する。
--    ※ RLS 側の長さ検査は 118_beta_write_rls.sql で追加済み。
-- 3) get_trending_hashtags が SECURITY DEFINER のまま非公開・管理者非表示・
--    BAN ユーザーの投稿を集計しており、非公開投稿由来のタグが漏えいし得た。
--    トレンドは「公開プロフィールの表示可能な投稿」だけを集計する。

-- ----------------------------------------------------------------
-- 1. post_hashtags: 投稿所有者のみ関連付け可
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "post_hashtags: 認証済みユーザーが追加可" ON public.post_hashtags;
CREATE POLICY "post_hashtags: 投稿の所有者のみ追加可"
    ON public.post_hashtags FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND p.user_id = auth.uid()
        )
        AND public.is_profile_active_for_writes(auth.uid())
        AND public.has_beta_write_access()
    );

-- ----------------------------------------------------------------
-- 2. hashtags.name の長さ制約（新規行のみ）
-- ----------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'hashtags_name_length'
          AND conrelid = 'public.hashtags'::regclass
    ) THEN
        ALTER TABLE public.hashtags
            ADD CONSTRAINT hashtags_name_length
            CHECK (char_length(name) BETWEEN 1 AND 100) NOT VALID;
    END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. トレンド集計から非公開・非表示・BAN 由来の投稿を除外
--    （093_event_room_links_trending.sql の完全な置き換え）
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trending_hashtags(limit_count integer DEFAULT 10)
RETURNS TABLE(name text, post_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH visible_posts AS (
        -- トレンドに乗せてよい投稿: 直近24時間・管理者非表示でない・
        -- 公開プロフィール・BAN されていない作者のもの
        SELECT p.id, p.broadcast_room_session_id, p.event_id
        FROM   public.posts p
        JOIN   public.profiles pr ON pr.id = p.user_id
        WHERE  p.created_at > now() - interval '24 hours'
          AND  NOT p.hidden_by_admin
          AND  pr.is_private = false
          AND  NOT EXISTS (
                   SELECT 1
                   FROM public.account_moderation am
                   WHERE am.user_id = p.user_id
                     AND am.status = 'banned'
               )
    ),
    tagged_posts AS (
        SELECT lower(h.name) AS name, ph.post_id
        FROM   public.hashtags h
        JOIN   public.post_hashtags ph ON ph.hashtag_id = h.id
        JOIN   visible_posts p         ON p.id = ph.post_id

        UNION

        -- 放送ルームのルームリンク: アニメの公式ハッシュタグ(なければタイトル正規化)で集計
        SELECT room_tag.name, p.id AS post_id
        FROM   visible_posts p
        JOIN   public.broadcast_room_sessions brs ON brs.id = p.broadcast_room_session_id
        JOIN   public.anime a                     ON a.id = brs.anime_id
        LEFT JOIN LATERAL (
            SELECT lower(regexp_replace(btrim(official_tags.tag), '^#+', '')) AS name
            FROM   unnest(coalesce(a.official_hashtag, ARRAY[]::text[])) AS official_tags(tag)
            WHERE  length(regexp_replace(btrim(official_tags.tag), '^#+', '')) > 0
            LIMIT  1
        ) official ON true
        CROSS JOIN LATERAL (
            SELECT lower(
                regexp_replace(
                    regexp_replace(a.title, '[[:space:]]+', '', 'g'),
                    '[^[:alnum:]_]',
                    '',
                    'g'
                )
            ) AS name
        ) fallback
        CROSS JOIN LATERAL (
            SELECT coalesce(nullif(official.name, ''), nullif(fallback.name, '')) AS name
        ) room_tag
        WHERE  p.broadcast_room_session_id IS NOT NULL
          AND  room_tag.name IS NOT NULL
          AND  (NOT a.hidden_by_admin OR public.is_current_user_admin())

        UNION

        -- イベントルームのルームリンク: イベントに設定されたタグで集計(中止イベントは除外)
        SELECT lower(regexp_replace(btrim(e.hashtag), '^#+', '')) AS name, p.id AS post_id
        FROM   visible_posts p
        JOIN   public.events e ON e.id = p.event_id
        WHERE  p.event_id IS NOT NULL
          AND  NOT e.is_cancelled
          AND  length(regexp_replace(btrim(e.hashtag), '^#+', '')) > 0
    )
    SELECT tagged_posts.name, COUNT(DISTINCT tagged_posts.post_id) AS post_count
    FROM   tagged_posts
    GROUP  BY tagged_posts.name
    ORDER  BY post_count DESC, tagged_posts.name ASC
    LIMIT  limit_count;
$$;
