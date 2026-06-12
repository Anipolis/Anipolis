-- ================================================================
-- 071: posts テーブルを Realtime publication に追加する
--
-- 放送ルームのライブ更新用。クライアントは
-- broadcast_room_session_id=eq.<session_id> フィルターで INSERT を購読し、
-- 受信をトリガーに /api/rooms/posts から整形済みの差分を取得する。
-- postgres_changes は RLS（posts の SELECT ポリシー）に従って配信される。
-- ================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'posts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
    END IF;
END;
$$;
