-- ================================================================
-- 208_hashtag_post_page.sql
-- ハッシュタグの画面の投稿を、DB の側で合わせて1ページ分の ID だけ返す（#248）
--
-- これまでは post_hashtags とイベントの一致する ID をアプリが全件読み、posts の in 句に並べてから50件に切っていた。
-- タグが育つほど ID の転送と URL が増え（URL の長さの上限で失敗する）、51件目より先へ進む手段も無かった。
--
-- get_hashtag_post_page(タグ, 目印の作成日時, 目印の ID, 件数):
--   * 「そのタグが付いた投稿」と「そのタグの中止されていないイベントの投稿」を合わせ、重複を除いて
--     （作成日時, ID）の新しい順に、目印より前を件数分だけ返す
--   * 返すのは ID と作成日時だけ。本文などは、アプリがこの ID で posts から読む（50件までの in 句）
--   * SECURITY INVOKER なので、posts・post_hashtags の RLS（鍵・ブロック・BAN・非表示）がそのまま効く
--   * タグは呼び出し側で小文字にそろえて渡す（hashtags.name・events.hashtag は小文字で持つ）
--   * 件数は 1〜100 に丸める
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_hashtag_post_page(
    p_tag text,
    p_before_created_at timestamptz DEFAULT NULL,
    p_before_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH params AS (
        SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS lim
    ),
    tagged AS (
        SELECT p.id, p.created_at
        FROM public.hashtags h
        JOIN public.post_hashtags ph ON ph.hashtag_id = h.id
        JOIN public.posts p ON p.id = ph.post_id
        WHERE h.name = p_tag
          AND (
              p_before_created_at IS NULL
              OR p_before_id IS NULL
              OR (p.created_at, p.id) < (p_before_created_at, p_before_id)
          )
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT (SELECT lim FROM params)
    ),
    from_events AS (
        SELECT p.id, p.created_at
        FROM public.events e
        JOIN public.posts p ON p.event_id = e.id
        WHERE e.hashtag = p_tag
          AND e.is_cancelled = false
          AND (
              p_before_created_at IS NULL
              OR p_before_id IS NULL
              OR (p.created_at, p.id) < (p_before_created_at, p_before_id)
          )
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT (SELECT lim FROM params)
    )
    SELECT u.id, u.created_at
    FROM (
        SELECT * FROM tagged
        UNION
        SELECT * FROM from_events
    ) u
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT (SELECT lim FROM params);
$$;

REVOKE ALL ON FUNCTION public.get_hashtag_post_page(text, timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hashtag_post_page(text, timestamptz, uuid, integer) TO authenticated, service_role;
