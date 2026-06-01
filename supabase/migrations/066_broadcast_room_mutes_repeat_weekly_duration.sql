-- Store the mute duration and weekly repetition as independent settings.

ALTER TABLE public.broadcast_room_mutes
    DROP CONSTRAINT IF EXISTS broadcast_room_mutes_duration_check;

-- Upgrade records written by the initial repeat-weekly implementation.
UPDATE public.broadcast_room_mutes
SET duration_days = 3
WHERE repeat_weekly
  AND duration_days IS NULL;

ALTER TABLE public.broadcast_room_mutes
    ADD CONSTRAINT broadcast_room_mutes_duration_check CHECK (
        (
            (mute_until_event_end AND duration_days IS NULL)
            OR (NOT mute_until_event_end AND duration_days IS NOT NULL)
        )
        AND (NOT repeat_weekly OR NOT mute_until_event_end)
    );
