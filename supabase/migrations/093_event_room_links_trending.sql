-- イベントルームのルームリンク付き投稿(posts.event_id)を、イベントに設定されたタグ
-- (events.hashtag、UI上は「ルームリンク」)としてトレンド集計に乗せる。
--
-- 注意: この関数定義は PR #144 (091_room_links_trending_hashtags.sql) の
-- 放送ルームリンク分岐を含む完全な置き換え。適用順は 091_room_links... → 本ファイル。
-- 逆順で適用すると本ファイルのイベント分岐が消えるため、Dashboardで手動適用する際は
-- 必ずこのファイルを最後に適用すること。

CREATE OR REPLACE FUNCTION public.get_trending_hashtags(limit_count integer DEFAULT 10)
RETURNS TABLE(name text, post_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH tagged_posts AS (
        SELECT lower(h.name) AS name, ph.post_id
        FROM   public.hashtags h
        JOIN   public.post_hashtags ph ON ph.hashtag_id = h.id
        JOIN   public.posts p          ON p.id = ph.post_id
        WHERE  p.created_at > now() - interval '24 hours'

        UNION

        -- 放送ルームのルームリンク: アニメの公式ハッシュタグ(なければタイトル正規化)で集計
        SELECT room_tag.name, p.id AS post_id
        FROM   public.posts p
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
        WHERE  p.created_at > now() - interval '24 hours'
          AND  p.broadcast_room_session_id IS NOT NULL
          AND  room_tag.name IS NOT NULL
          AND  (NOT a.hidden_by_admin OR public.is_current_user_admin())

        UNION

        -- イベントルームのルームリンク: イベントに設定されたタグで集計(中止イベントは除外)
        SELECT lower(regexp_replace(btrim(e.hashtag), '^#+', '')) AS name, p.id AS post_id
        FROM   public.posts p
        JOIN   public.events e ON e.id = p.event_id
        WHERE  p.created_at > now() - interval '24 hours'
          AND  p.event_id IS NOT NULL
          AND  NOT e.is_cancelled
          AND  length(regexp_replace(btrim(e.hashtag), '^#+', '')) > 0
    )
    SELECT tagged_posts.name, COUNT(DISTINCT tagged_posts.post_id) AS post_count
    FROM   tagged_posts
    GROUP  BY tagged_posts.name
    ORDER  BY post_count DESC, tagged_posts.name ASC
    LIMIT  limit_count;
$$;
