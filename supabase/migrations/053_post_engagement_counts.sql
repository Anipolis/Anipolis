-- Aggregate public engagement counts without sending every related row to the app server.
CREATE OR REPLACE FUNCTION public.get_post_engagement_counts(target_post_ids uuid[])
RETURNS TABLE (
  post_id uuid,
  like_count bigint,
  repost_count bigint,
  reply_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target_posts AS (
    SELECT DISTINCT unnest(target_post_ids) AS post_id
    WHERE unnest(target_post_ids) IS NOT NULL
  ),
  like_counts AS (
    SELECT likes.post_id, COUNT(*) AS like_count
    FROM public.likes
    JOIN target_posts ON target_posts.post_id = likes.post_id
    GROUP BY likes.post_id
  ),
  repost_counts AS (
    SELECT reposts.post_id, COUNT(*) AS repost_count
    FROM public.reposts
    JOIN target_posts ON target_posts.post_id = reposts.post_id
    GROUP BY reposts.post_id
  ),
  reply_counts AS (
    SELECT posts.parent_id AS post_id, COUNT(*) AS reply_count
    FROM public.posts
    JOIN target_posts ON target_posts.post_id = posts.parent_id
    GROUP BY posts.parent_id
  )
  SELECT
    target_posts.post_id,
    COALESCE(like_counts.like_count, 0),
    COALESCE(repost_counts.repost_count, 0),
    COALESCE(reply_counts.reply_count, 0)
  FROM target_posts
  LEFT JOIN like_counts USING (post_id)
  LEFT JOIN repost_counts USING (post_id)
  LEFT JOIN reply_counts USING (post_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_post_engagement_counts(uuid[]) TO anon, authenticated;
