-- ============================================================
-- 003: posts テーブルにリプライ用 parent_id を追加
-- ============================================================
ALTER TABLE public.posts
    ADD COLUMN parent_id uuid REFERENCES public.posts(id) ON DELETE CASCADE;

CREATE INDEX idx_posts_parent_id ON public.posts (parent_id);
