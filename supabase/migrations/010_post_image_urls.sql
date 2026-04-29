-- posts テーブルに画像URL配列カラムを追加
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
