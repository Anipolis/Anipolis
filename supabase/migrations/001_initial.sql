-- ============================================================
-- Anipolis MVP — 初期マイグレーション
-- ============================================================

-- ----------------------------------------------------------------
-- 1. profiles（auth.users の拡張）
-- ----------------------------------------------------------------
CREATE TABLE public.profiles (
    id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username     text UNIQUE NOT NULL,
    display_name text,
    avatar_url   text,
    bio          text,
    created_at   timestamptz DEFAULT now() NOT NULL
);

-- ----------------------------------------------------------------
-- 2. posts（投稿）
-- ----------------------------------------------------------------
CREATE TABLE public.posts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_posts_created_at ON public.posts (created_at DESC);
CREATE INDEX idx_posts_user_id    ON public.posts (user_id);

-- ----------------------------------------------------------------
-- 3. hashtags
-- ----------------------------------------------------------------
CREATE TABLE public.hashtags (
    id   bigserial PRIMARY KEY,
    name text UNIQUE NOT NULL
);

CREATE INDEX idx_hashtags_name ON public.hashtags (name);

-- ----------------------------------------------------------------
-- 4. post_hashtags（多対多）
-- ----------------------------------------------------------------
CREATE TABLE public.post_hashtags (
    post_id    uuid   REFERENCES public.posts(id) ON DELETE CASCADE,
    hashtag_id bigint REFERENCES public.hashtags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX idx_post_hashtags_hashtag ON public.post_hashtags (hashtag_id);

-- ----------------------------------------------------------------
-- 5. Googleログイン時にprofileを自動作成するトリガー
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    base_username text;
    final_username text;
    counter       integer := 0;
BEGIN
    -- Googleのメタデータからベースusernameを生成
    base_username := COALESCE(
        new.raw_user_meta_data->>'user_name',
        split_part(new.email, '@', 1)
    );
    -- 英数字・アンダースコア以外を除去
    base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');
    -- 短すぎる場合は補完
    IF char_length(base_username) < 3 THEN
        base_username := 'user' || base_username;
    END IF;
    -- 先頭20文字に制限
    base_username := left(base_username, 20);

    final_username := base_username;

    -- 重複時はサフィックスを付加
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
        counter := counter + 1;
        final_username := left(base_username, 17) || counter::text;
    END LOOP;

    INSERT INTO public.profiles (id, username, display_name, avatar_url)
    VALUES (
        new.id,
        final_username,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
        new.raw_user_meta_data->>'avatar_url'
    );

    RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user();

-- ----------------------------------------------------------------
-- 6. トレンドハッシュタグ取得関数（直近24時間）
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trending_hashtags(limit_count integer DEFAULT 10)
RETURNS TABLE(name text, post_count bigint)
LANGUAGE sql
STABLE
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

-- ----------------------------------------------------------------
-- 7. RLS（Row Level Security）
-- ----------------------------------------------------------------
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: 誰でも読める"
    ON public.profiles FOR SELECT USING (true);

CREATE POLICY "profiles: 自分だけ更新可"
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- posts
CREATE POLICY "posts: 誰でも読める"
    ON public.posts FOR SELECT USING (true);

CREATE POLICY "posts: 認証済みユーザーが投稿可"
    ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "posts: 自分の投稿だけ削除可"
    ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- hashtags
CREATE POLICY "hashtags: 誰でも読める"
    ON public.hashtags FOR SELECT USING (true);

CREATE POLICY "hashtags: 認証済みユーザーが追加可"
    ON public.hashtags FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- post_hashtags
CREATE POLICY "post_hashtags: 誰でも読める"
    ON public.post_hashtags FOR SELECT USING (true);

CREATE POLICY "post_hashtags: 認証済みユーザーが追加可"
    ON public.post_hashtags FOR INSERT WITH CHECK (auth.role() = 'authenticated');
