-- ================================================================
-- 070: 放送通知の生成を pg_cron に移行する
--
-- これまで +layout.server.ts がログインユーザーの毎リクエストで
-- generate_due_broadcast_notifications() を呼んでいた（購読テーブルの
-- スキャン＋INSERT がリクエストパスに乗っていた）。
-- 既存の dispatch_due_broadcast_notifications()（全ユーザー一括版）を
-- pg_cron で毎分実行し、アプリ側の呼び出しを廃止する。
--
-- 注意: このマイグレーションを適用してから、layout の呼び出し削除を
-- デプロイすること（逆順だと通知が生成されない期間が生じる）。
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 同名ジョブがあれば置き換え（pg_cron 1.4+ は cron.schedule が同名を更新する）
SELECT cron.schedule(
    'dispatch-broadcast-notifications',
    '* * * * *',
    $$SELECT public.dispatch_due_broadcast_notifications()$$
);
