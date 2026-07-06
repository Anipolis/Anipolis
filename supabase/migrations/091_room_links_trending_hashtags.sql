-- Count room links as their anime room hashtag in the trending hashtag RPC.

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
    )
    SELECT tagged_posts.name, COUNT(DISTINCT tagged_posts.post_id) AS post_count
    FROM   tagged_posts
    GROUP  BY tagged_posts.name
    ORDER  BY post_count DESC, tagged_posts.name ASC
    LIMIT  limit_count;
$$;
