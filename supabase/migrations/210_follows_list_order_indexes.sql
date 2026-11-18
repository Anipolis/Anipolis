-- ================================================================
-- 210_follows_list_order_indexes.sql
-- フォロワー・フォロー中の一覧を、フォローした日時の新しい順に1ページずつ読むためのインデックス（#244）
--
-- 一覧は「相手を絞る列 = プロフィールの ID」で絞り、（created_at DESC, 相手の ID DESC）で並べて、
-- 同じ並びのカーソル（created_at, 相手の ID）で続きを読む。並べ替えをインデックスで済ませ、
-- フォロワーの多い人でも、全件を並べ替えずに先頭の50件だけを読めるようにする。
-- 009 の idx_follows_following / idx_follows_follower は外部キーの削除などで使うので残す。
-- ================================================================

CREATE INDEX IF NOT EXISTS follows_following_created_idx
    ON public.follows (following_id, created_at DESC, follower_id DESC);

CREATE INDEX IF NOT EXISTS follows_follower_created_idx
    ON public.follows (follower_id, created_at DESC, following_id DESC);
