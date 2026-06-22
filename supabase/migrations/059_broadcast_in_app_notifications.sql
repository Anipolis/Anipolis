-- In-app reminders for subscribed anime broadcast rooms.

ALTER TABLE public.notifications
    ALTER COLUMN actor_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS broadcast_anime_id integer REFERENCES public.anime(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS broadcast_scheduled_at timestamptz,
    ADD COLUMN IF NOT EXISTS broadcast_room_date date,
    ADD COLUMN IF NOT EXISTS broadcast_offset_minutes integer;

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'like',
        'repost',
        'reply',
        'mention',
        'follow',
        'follow_request',
        'anime_recommendation',
        'broadcast'
    ));

CREATE INDEX IF NOT EXISTS notifications_unread_broadcast_recipient_idx
    ON public.notifications (recipient_id, created_at DESC)
    WHERE type = 'broadcast' AND NOT read;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_broadcast_slot_unique_idx
    ON public.notifications (recipient_id, broadcast_anime_id, broadcast_scheduled_at)
    WHERE type = 'broadcast';

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
        candidate.notify_minutes
    FROM (
        SELECT
            subscription.user_id,
            anime.id AS anime_id,
            GREATEST(
                CASE WHEN COALESCE(settings.notify_1min, true) THEN 1 ELSE 0 END,
                CASE WHEN COALESCE(settings.notify_5min, true) THEN 5 ELSE 0 END,
                CASE WHEN COALESCE(settings.notify_30min, false) THEN 30 ELSE 0 END
            ) AS notify_minutes,
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
    JOIN public.anime anime ON anime.id = candidate.anime_id
    WHERE candidate.notify_minutes > 0
      AND candidate.scheduled_jst - (candidate.notify_minutes || ' minutes')::interval <= jst_now
      AND candidate.scheduled_jst + interval '30 minutes' >= jst_now
      AND (anime.aired_from IS NULL OR candidate.room_date >= anime.aired_from::date)
      AND (anime.aired_to IS NULL OR candidate.room_date <= anime.aired_to::date)
    ON CONFLICT (recipient_id, broadcast_anime_id, broadcast_scheduled_at)
        WHERE type = 'broadcast'
        DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_due_broadcast_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        PERFORM public.enqueue_due_broadcast_notifications(auth.uid());
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_due_broadcast_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.enqueue_due_broadcast_notifications(NULL);
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_broadcast_notifications(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_due_broadcast_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_due_broadcast_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_due_broadcast_notifications() TO authenticated;

-- Supabase Cron uses pg_cron. The app-triggered function above remains a fallback
-- for projects where the Cron integration has not been enabled yet.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'dispatch-broadcast-room-notifications';

        PERFORM cron.schedule(
            'dispatch-broadcast-room-notifications',
            '* * * * *',
            'SELECT public.dispatch_due_broadcast_notifications()'
        );
    END IF;
END;
$$;
