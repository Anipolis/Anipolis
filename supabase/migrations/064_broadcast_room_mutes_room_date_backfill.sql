-- Repair databases where migration 061 ran before broadcast_room_mutes.room_date
-- was added to the table definition.

ALTER TABLE public.broadcast_room_mutes
    ADD COLUMN IF NOT EXISTS room_date date;

UPDATE public.broadcast_room_mutes mute
SET room_date = session.room_date
FROM public.broadcast_room_sessions session
WHERE mute.room_date IS NULL
  AND mute.room_session_id = session.id;

DELETE FROM public.broadcast_room_mutes
WHERE room_date IS NULL;

ALTER TABLE public.broadcast_room_mutes
    ALTER COLUMN room_date SET NOT NULL;
