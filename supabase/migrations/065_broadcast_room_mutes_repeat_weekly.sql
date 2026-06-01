-- Allow users to keep hiding posts from the same anime's broadcast room every week.

ALTER TABLE public.broadcast_room_mutes
    ADD COLUMN IF NOT EXISTS repeat_weekly boolean NOT NULL DEFAULT false;

ALTER TABLE public.broadcast_room_mutes
    DROP CONSTRAINT IF EXISTS broadcast_room_mutes_duration_check;

ALTER TABLE public.broadcast_room_mutes
    ADD CONSTRAINT broadcast_room_mutes_duration_check CHECK (
        (repeat_weekly AND NOT mute_until_event_end AND duration_days IS NULL)
        OR (
            NOT repeat_weekly
            AND (
                (mute_until_event_end AND duration_days IS NULL)
                OR (NOT mute_until_event_end AND duration_days IS NOT NULL)
            )
        )
    );
