-- イベント通知をリアタイルームと同じサブスクリプションモデルに統一する。
-- event_notification_settings は「行の存在 = 通知オン」のみを表し、
-- 通知タイミング(1分前/5分前/30分前)はリアタイルームと共通の
-- broadcast_notification_settings(/settings/rooms/notifications)で管理する。
-- イベント個別のタイミング列は廃止。

ALTER TABLE public.event_notification_settings
    DROP COLUMN IF EXISTS notify_1min,
    DROP COLUMN IF EXISTS notify_5min,
    DROP COLUMN IF EXISTS notify_30min;
