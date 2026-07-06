-- notifications_event_slot_unique_idx を CONCURRENTLY で作成する。
-- notifications は通知が飛ぶたびに書き込まれる高頻度テーブルのため、
-- 素の CREATE UNIQUE INDEX による書き込みロックを避けてこのファイルに分離する
-- (092_posts_event_id_idx_concurrently.sql と同じ理由・同じパターン)。
--
-- 注意: CONCURRENTLY はトランザクション内で実行できないため、
-- このファイルは単独で(他のDDLと同じトランザクションに含めずに)適用すること。
-- 096 のイベント通知分岐の ON CONFLICT はこのインデックスに依存する。

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS notifications_event_slot_unique_idx
    ON public.notifications (recipient_id, event_id)
    WHERE type = 'broadcast' AND event_id IS NOT NULL;
