-- ============================================================
-- 082_posts_hotpath_indexes: 投稿ホットパス向けの複合インデックス
-- ============================================================
-- 目的:
--   投稿系ホットパスのソート・絞り込みに対応する複合インデックスを追加し、
--   `WHERE ... ORDER BY created_at DESC LIMIT n` パターンの
--   明示的ソートコストを削減する。
--
-- 既存インデックスは単一カラムのみ:
--   idx_posts_created_at  … posts(created_at DESC)
--   idx_posts_user_id     … posts(user_id)
--   idx_posts_parent_id   … posts(parent_id)
--
-- 適用後は本番相当データで EXPLAIN ANALYZE を取り、
-- 実際のプランで Index Scan に切り替わることを確認すること。
-- ============================================================

-- プロフィール投稿 / フォロー中タイムライン:
--   eq(user_id) AND parent_id IS NULL ORDER BY created_at DESC LIMIT 50
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_user_created_idx
    ON public.posts (user_id, created_at DESC)
    WHERE parent_id IS NULL;

-- ホーム（all）タイムライン:
--   parent_id IS NULL ORDER BY created_at DESC LIMIT 50
-- トップレベル投稿のみを対象にした部分インデックス。
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_toplevel_created_idx
    ON public.posts (created_at DESC)
    WHERE parent_id IS NULL;

-- 放送ルームのタイムライン:
--   eq(broadcast_room_session_id) ORDER BY created_at DESC LIMIT 100
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_room_created_idx
    ON public.posts (broadcast_room_session_id, created_at DESC)
    WHERE broadcast_room_session_id IS NOT NULL
      AND parent_id IS NULL;
