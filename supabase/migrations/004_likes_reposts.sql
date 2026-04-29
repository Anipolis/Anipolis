-- ============================================================
-- 004: いいね・リポストテーブルの追加
-- ============================================================

-- ----------------------------------------------------------------
-- 1. likes（いいね）
-- ----------------------------------------------------------------
CREATE TABLE public.likes (
    post_id    uuid REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_likes_post_id ON public.likes (post_id);
CREATE INDEX idx_likes_user_id ON public.likes (user_id);

-- ----------------------------------------------------------------
-- 2. reposts（リポスト）
-- ----------------------------------------------------------------
CREATE TABLE public.reposts (
    post_id    uuid REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_reposts_post_id ON public.reposts (post_id);
CREATE INDEX idx_reposts_user_id ON public.reposts (user_id);

-- ----------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------
ALTER TABLE public.likes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

-- likes
CREATE POLICY "likes: 誰でも読める"
    ON public.likes FOR SELECT USING (true);

CREATE POLICY "likes: 認証済みユーザーがいいね可"
    ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "likes: 自分のいいねだけ削除可"
    ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- reposts
CREATE POLICY "reposts: 誰でも読める"
    ON public.reposts FOR SELECT USING (true);

CREATE POLICY "reposts: 認証済みユーザーがリポスト可"
    ON public.reposts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reposts: 自分のリポストだけ削除可"
    ON public.reposts FOR DELETE USING (auth.uid() = user_id);
