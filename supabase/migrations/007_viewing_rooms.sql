-- ================================================================
-- 007: イベント視聴ルーム
-- 旧同時視聴ルーム（viewing_rooms）を廃止し、カレンダー型イベントへ置換
-- ================================================================

-- 旧テーブルを削除（既に適用済みの場合に対応）
DROP TABLE IF EXISTS room_posts    CASCADE;
DROP TABLE IF EXISTS room_members  CASCADE;
DROP TABLE IF EXISTS viewing_rooms CASCADE;
DROP FUNCTION IF EXISTS generate_room_code();

-- ================================================================
-- events テーブル
-- ================================================================
CREATE TABLE IF NOT EXISTS events (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title            TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
    description      TEXT        CHECK (description IS NULL OR char_length(description) <= 280),
    hashtag          TEXT        NOT NULL CHECK (char_length(hashtag) BETWEEN 1 AND 50),
    scheduled_at     TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER     CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    is_cancelled     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS events_scheduled_at_idx ON events (scheduled_at);
CREATE INDEX IF NOT EXISTS events_creator_id_idx   ON events (creator_id);
CREATE INDEX IF NOT EXISTS events_hashtag_idx       ON events (hashtag);

-- RLS 有効化
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが参照可（未ログインも含む）
DROP POLICY IF EXISTS "イベントは全員参照可" ON events;
CREATE POLICY "イベントは全員参照可" ON events
    FOR SELECT USING (TRUE);

-- ログインユーザーのみ作成可
DROP POLICY IF EXISTS "認証ユーザーはイベントを作成可" ON events;
CREATE POLICY "認証ユーザーはイベントを作成可" ON events
    FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());

-- 作成者のみ更新可（キャンセルなど）
DROP POLICY IF EXISTS "作成者はイベントを更新可" ON events;
CREATE POLICY "作成者はイベントを更新可" ON events
    FOR UPDATE TO authenticated USING (creator_id = auth.uid());

-- Supabase Realtime を有効化
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE events;
    END IF;
END $$;
