-- ================================================================
-- デモ用イベントシード: 葬送のフリーレン 実況ルーム
-- ================================================================
-- 使い方:
--   1. Supabase ダッシュボード → SQL Editor で 007_viewing_rooms.sql を先に実行
--   2. その後このファイルを実行
--
-- このシードは auth.users の最初のユーザー（プラットフォーム管理者）を
-- creator として、現在時刻の5分前に開始した LIVE イベントを作成します。
-- ================================================================

DO $$
DECLARE
    v_creator_id uuid;
BEGIN
    -- Resolve the creator; fail loudly if no users exist yet.
    SELECT id INTO v_creator_id
    FROM auth.users
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_creator_id IS NULL THEN
        RAISE EXCEPTION 'seed 001: no users found in auth.users — run auth fixtures first';
    END IF;

    -- Idempotent insert: skip if this specific event already exists.
    INSERT INTO events (creator_id, title, description, hashtag, scheduled_at, duration_minutes)
    SELECT
        v_creator_id,
        '葬送のフリーレン 第1話 同時視聴',
        '葬送のフリーレン第1話の同時視聴・実況イベントです。放送に合わせて #フリーレン タグで盛り上がりましょう！',
        'フリーレン',
        NOW() - INTERVAL '5 minutes',   -- 5分前に開始 → 現在 LIVE 状態
        110                              -- 約1時間50分（第1話の放送時間）
    WHERE NOT EXISTS (
        SELECT 1 FROM events
        WHERE title       = '葬送のフリーレン 第1話 同時視聴'
          AND hashtag     = 'フリーレン'
          AND creator_id  = v_creator_id
    );
END;
$$;
