-- 引用リポスト用の quoted_post_id カラムを posts テーブルに追加
ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS quoted_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;

-- インデックス（引用元投稿からの逆引きに使用）
CREATE INDEX IF NOT EXISTS posts_quoted_post_id_idx ON posts(quoted_post_id) WHERE quoted_post_id IS NOT NULL;
