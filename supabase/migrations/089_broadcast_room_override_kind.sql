ALTER TABLE public.broadcast_room_overrides
	ADD COLUMN IF NOT EXISTS override_kind text;

UPDATE public.broadcast_room_overrides
SET override_kind = CASE
	WHEN is_cancelled THEN 'cancelled'
	WHEN episode_start IS NOT NULL
		AND episode_end IS NOT NULL
		AND episode_end > episode_start THEN 'marathon'
	WHEN episode_label IS NOT NULL
		OR episode_count_increment = 0 THEN 'recap'
	WHEN broadcast_time IS NOT NULL
		OR duration_minutes IS NOT NULL
		OR pre_open_minutes IS NOT NULL
		OR post_close_minutes IS NOT NULL THEN 'time_change'
	ELSE 'custom'
END
WHERE override_kind IS NULL;

ALTER TABLE public.broadcast_room_overrides
	ALTER COLUMN override_kind SET DEFAULT 'custom',
	ALTER COLUMN override_kind SET NOT NULL;

ALTER TABLE public.broadcast_room_overrides
	DROP CONSTRAINT IF EXISTS broadcast_room_overrides_kind_check;

ALTER TABLE public.broadcast_room_overrides
	ADD CONSTRAINT broadcast_room_overrides_kind_check
	CHECK (override_kind IN ('cancelled', 'recap', 'time_change', 'marathon', 'custom'));
