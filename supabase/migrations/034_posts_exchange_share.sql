-- ================================================================
-- 034_posts_exchange_share.sql
-- Store public anime exchange share snapshots on posts.
-- ================================================================

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS exchange_share jsonb;

NOTIFY pgrst, 'reload schema';
