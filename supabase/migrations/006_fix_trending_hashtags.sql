-- ============================================================
-- 006: get_trending_hashtags 関数の修正
--
-- 問題: SECURITY INVOKER（デフォルト）で実行されるため、
--       RLS の影響を受けて自分の投稿しかカウントされない場合がある。
--
-- 修正:
--   1. SECURITY DEFINER を追加 → RLS をバイパスし全ユーザー投稿を参照
--   2. SET search_path = public → SECURITY DEFINER 関数の必須セキュリティ設定
--   3. 集計期間: 24 時間（元の設定に戻す）
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_trending_hashtags(limit_count integer DEFAULT 10)
RETURNS TABLE(name text, post_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT h.name, COUNT(ph.post_id) AS post_count
    FROM   public.hashtags h
    JOIN   public.post_hashtags ph ON ph.hashtag_id = h.id
    JOIN   public.posts p          ON p.id = ph.post_id
    WHERE  p.created_at > now() - interval '24 hours'
    GROUP  BY h.name
    ORDER  BY post_count DESC
    LIMIT  limit_count;
$$;
