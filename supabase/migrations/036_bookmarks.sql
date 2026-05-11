-- ブックマーク機能: 投稿を保存する
CREATE TABLE public.bookmarks (
    post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- 自分のブックマークのみ参照可能
CREATE POLICY "bookmarks_select_own" ON public.bookmarks
    FOR SELECT USING (auth.uid() = user_id);

-- ログイン済みユーザーのみ追加可能
CREATE POLICY "bookmarks_insert_own" ON public.bookmarks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 自分のブックマークのみ削除可能
CREATE POLICY "bookmarks_delete_own" ON public.bookmarks
    FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX bookmarks_user_id_idx ON public.bookmarks (user_id, created_at DESC);
