-- ================================================================
-- 035_relax_posts_content_check.sql
-- Allow attachment-only posts, including anime exchange shares.
-- ================================================================

ALTER TABLE public.posts
DROP CONSTRAINT IF EXISTS posts_content_check;

ALTER TABLE public.posts
ADD CONSTRAINT posts_content_check
CHECK (
    char_length(content) <= 280
    AND (
        char_length(content) > 0
        OR cardinality(image_urls) > 0
        OR anime_id IS NOT NULL
        OR exchange_share IS NOT NULL
    )
);
