-- 投稿にアニメ引用を紐付けるための anime_id カラムを追加
ALTER TABLE posts
    ADD COLUMN anime_id uuid REFERENCES anime(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS posts_anime_id_idx ON posts (anime_id)
    WHERE anime_id IS NOT NULL;
