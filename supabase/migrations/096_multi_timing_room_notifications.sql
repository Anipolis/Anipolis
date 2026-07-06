-- ルーム通知(リアタイ・イベント)のマルチタイミング発火 + 同一ルーム通知の上書き更新。
--
-- これまで: 選択したタイミング(1分前/5分前/30分前)のうち最も早いもの一度だけ発火
--   (GREATEST でリード時間を1つに集約 + ON CONFLICT DO NOTHING)。
-- これから: 選択した各タイミングの閾値を越えるたびに発火する。ただしアプリ内通知欄では
--   同じルームの通知行を UPDATE で上書きし(offset更新 + read=false + created_at更新)、
--   通知欄には同一ルームにつき常に1行だけが最新状態で表示される。
--
-- 実装: 「選択済みタイミングのうち、現時刻までに閾値を越えた最小リード(due_offset)」を
-- 毎分計算し upsert する。due_offset は時間経過で 30→5→1 と単調減少するため、
-- 既存行と offset が異なるときだけ UPDATE することで、閾値を越えた瞬間にのみ
-- 通知が未読化・最上部に浮上する(毎分の再実行では何も起きない)。
--
-- あわせてイベントルームの通知配信を実装する:
--   - notifications.event_id 列を追加(イベント通知は broadcast_anime_id = NULL)
--   - サブスクリプションは event_notification_settings(行の存在=通知オン)
--   - タイミングはリアタイルームと共通の broadcast_notification_settings を使用

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;

-- notifications_event_slot_unique_idx は書き込み頻度の高い notifications をロックしないよう
-- 097_notifications_event_slot_idx_concurrently.sql で CREATE UNIQUE INDEX CONCURRENTLY として作成する。
-- 注意: 下のイベント分岐の ON CONFLICT はこのインデックスに依存するため、
-- 097 を適用してから cron が次に走るまでの間にイベント通知が必要なら 097 を先に適用すること。

CREATE OR REPLACE FUNCTION public.enqueue_due_broadcast_notifications(target_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    jst_now timestamp := clock_timestamp() AT TIME ZONE 'Asia/Tokyo';
    current_week_start date;
BEGIN
    current_week_start := jst_now::date - EXTRACT(DOW FROM jst_now)::integer;

    -- ── リアタイルーム(放送ルーム) ─────────────────────────────
    INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        type,
        post_id,
        broadcast_anime_id,
        broadcast_scheduled_at,
        broadcast_room_date,
        broadcast_offset_minutes
    )
    SELECT
        candidate.user_id,
        NULL,
        'broadcast',
        NULL,
        candidate.anime_id,
        candidate.scheduled_jst AT TIME ZONE 'Asia/Tokyo',
        candidate.room_date,
        due.due_offset
    FROM (
        SELECT
            subscription.user_id,
            anime.id AS anime_id,
            anime.broadcast_duration_minutes,
            anime.aired_from,
            anime.aired_to,
            COALESCE(settings.notify_1min, true) AS notify_1min,
            COALESCE(settings.notify_5min, true) AS notify_5min,
            COALESCE(settings.notify_30min, false) AS notify_30min,
            (
                current_week_start
                + (week.offset_days || ' days')::interval
                + (anime.broadcast_day || ' days')::interval
            )::date AS room_date,
            (
                (current_week_start + (week.offset_days || ' days')::interval)
                + (anime.broadcast_day || ' days')::interval
                + (split_part(anime.broadcast_time, ':', 1)::integer || ' hours')::interval
                + (split_part(anime.broadcast_time, ':', 2)::integer || ' minutes')::interval
            ) AS scheduled_jst
        FROM public.broadcast_notification_subscriptions subscription
        JOIN public.anime anime ON anime.id = subscription.anime_id
        LEFT JOIN public.broadcast_notification_settings settings ON settings.user_id = subscription.user_id
        CROSS JOIN (VALUES (-7), (0)) AS week(offset_days)
        WHERE (target_user_id IS NULL OR subscription.user_id = target_user_id)
          AND anime.broadcast_day IS NOT NULL
          AND anime.broadcast_time IS NOT NULL
    ) candidate
    CROSS JOIN LATERAL (
        -- 現時点で閾値を越えている選択済みタイミングのうち、最小のリード時間。
        -- LEAST は NULL を無視するため、どの閾値も越えていなければ NULL になる。
        SELECT LEAST(
            CASE WHEN candidate.notify_1min AND candidate.scheduled_jst - interval '1 minute' <= jst_now THEN 1 END,
            CASE WHEN candidate.notify_5min AND candidate.scheduled_jst - interval '5 minutes' <= jst_now THEN 5 END,
            CASE WHEN candidate.notify_30min AND candidate.scheduled_jst - interval '30 minutes' <= jst_now THEN 30 END
        ) AS due_offset
    ) due
    WHERE due.due_offset IS NOT NULL
      AND candidate.scheduled_jst + (candidate.broadcast_duration_minutes || ' minutes')::interval >= jst_now
      AND (candidate.aired_from IS NULL OR candidate.room_date >= candidate.aired_from::date)
      AND (candidate.aired_to IS NULL OR candidate.room_date <= candidate.aired_to::date)
    ON CONFLICT (recipient_id, broadcast_anime_id, broadcast_scheduled_at)
        WHERE type = 'broadcast'
        DO UPDATE SET
            broadcast_offset_minutes = EXCLUDED.broadcast_offset_minutes,
            created_at = now(),
            read = false
        WHERE notifications.broadcast_offset_minutes IS DISTINCT FROM EXCLUDED.broadcast_offset_minutes;

    -- ── イベントルーム ─────────────────────────────────────────
    INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        type,
        post_id,
        event_id,
        broadcast_scheduled_at,
        broadcast_room_date,
        broadcast_offset_minutes
    )
    SELECT
        candidate.user_id,
        NULL,
        'broadcast',
        NULL,
        candidate.event_id,
        candidate.scheduled_at,
        (candidate.scheduled_at AT TIME ZONE 'Asia/Tokyo')::date,
        due.due_offset
    FROM (
        SELECT
            subscription.user_id,
            e.id AS event_id,
            e.scheduled_at,
            COALESCE(e.duration_minutes, 360) AS duration_minutes,
            COALESCE(settings.notify_1min, true) AS notify_1min,
            COALESCE(settings.notify_5min, true) AS notify_5min,
            COALESCE(settings.notify_30min, false) AS notify_30min
        FROM public.event_notification_settings subscription
        JOIN public.events e ON e.id = subscription.event_id
        LEFT JOIN public.broadcast_notification_settings settings ON settings.user_id = subscription.user_id
        WHERE (target_user_id IS NULL OR subscription.user_id = target_user_id)
          AND NOT e.is_cancelled
    ) candidate
    CROSS JOIN LATERAL (
        SELECT LEAST(
            CASE WHEN candidate.notify_1min AND candidate.scheduled_at - interval '1 minute' <= clock_timestamp() THEN 1 END,
            CASE WHEN candidate.notify_5min AND candidate.scheduled_at - interval '5 minutes' <= clock_timestamp() THEN 5 END,
            CASE WHEN candidate.notify_30min AND candidate.scheduled_at - interval '30 minutes' <= clock_timestamp() THEN 30 END
        ) AS due_offset
    ) due
    WHERE due.due_offset IS NOT NULL
      AND candidate.scheduled_at + (candidate.duration_minutes || ' minutes')::interval >= clock_timestamp()
    ON CONFLICT (recipient_id, event_id)
        WHERE type = 'broadcast' AND event_id IS NOT NULL
        DO UPDATE SET
            broadcast_offset_minutes = EXCLUDED.broadcast_offset_minutes,
            created_at = now(),
            read = false
        WHERE notifications.broadcast_offset_minutes IS DISTINCT FROM EXCLUDED.broadcast_offset_minutes;
END;
$$;
