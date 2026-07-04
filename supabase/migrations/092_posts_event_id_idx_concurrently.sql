-- posts_event_id_idx を CONCURRENTLY で作成する。
-- 091_unify_event_rooms.sql の通常の CREATE INDEX は posts への書き込みを
-- インデックス構築中ロックしてしまうため、このファイルに分離する
-- （082_posts_hotpath_indexes.sql と同じ理由・同じパターン）。
--
-- 注意: CONCURRENTLY はトランザクション内で実行できないため、
-- このファイルは単独で（他のDDLと同じトランザクションに含めずに）適用すること。

CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_event_id_idx
    ON public.posts (event_id, created_at DESC)
    WHERE event_id IS NOT NULL;
