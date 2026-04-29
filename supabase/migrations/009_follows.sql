-- ================================================================
-- 009: フォロー機能
-- ================================================================

CREATE TABLE public.follows (
    follower_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at   timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_follower  ON public.follows (follower_id);
CREATE INDEX idx_follows_following ON public.follows (following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows: 誰でも読める"
    ON public.follows FOR SELECT USING (true);

CREATE POLICY "follows: 認証済みユーザーがフォロー可"
    ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows: 自分のフォローだけ削除可"
    ON public.follows FOR DELETE USING (auth.uid() = follower_id);
