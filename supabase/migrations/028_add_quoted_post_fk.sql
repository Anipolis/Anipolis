-- quoted_post_id FK制約が存在しない場合のみ追加
-- migration 027でカラムが既存だった場合、ADD COLUMN IF NOT EXISTSでFK制約がスキップされる問題の修正
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = 'posts_quoted_post_id_fkey'
          AND table_name = 'posts'
    ) THEN
        ALTER TABLE posts
            ADD CONSTRAINT posts_quoted_post_id_fkey
            FOREIGN KEY (quoted_post_id) REFERENCES posts(id) ON DELETE SET NULL;
    END IF;
END $$;

-- インデックスも同様に確認
CREATE INDEX IF NOT EXISTS posts_quoted_post_id_idx ON posts(quoted_post_id) WHERE quoted_post_id IS NOT NULL;
