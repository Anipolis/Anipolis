-- Adds the episode range an irregular broadcast covers, so the weekly calendar
-- generation can shift episode numbering forward when multiple episodes air at once
-- (e.g. a 1-hour slot that airs episode 1 and episode 2 back-to-back).

ALTER TABLE public.broadcast_room_overrides
	ADD COLUMN IF NOT EXISTS episode_start integer CHECK (episode_start IS NULL OR episode_start >= 1),
	ADD COLUMN IF NOT EXISTS episode_end integer CHECK (episode_end IS NULL OR episode_end >= 1),
	ADD COLUMN IF NOT EXISTS episode_label text,
	ADD COLUMN IF NOT EXISTS episode_count_increment integer CHECK (
		episode_count_increment IS NULL OR episode_count_increment >= 0
	),
	ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS announcement_label text;

ALTER TABLE public.broadcast_room_overrides
	DROP CONSTRAINT IF EXISTS broadcast_room_overrides_episode_range_check,
	DROP CONSTRAINT IF EXISTS broadcast_room_overrides_episode_label_check,
	DROP CONSTRAINT IF EXISTS broadcast_room_overrides_announcement_label_check;

ALTER TABLE public.broadcast_room_overrides
	ADD CONSTRAINT broadcast_room_overrides_episode_range_check
	CHECK (
		(episode_start IS NULL AND episode_end IS NULL)
		OR (episode_start IS NOT NULL AND episode_end IS NOT NULL AND episode_end >= episode_start)
	),
	ADD CONSTRAINT broadcast_room_overrides_episode_label_check
	CHECK (
		episode_label IS NULL OR btrim(episode_label) <> ''
	),
	ADD CONSTRAINT broadcast_room_overrides_announcement_label_check
	CHECK (
		announcement_label IS NULL OR btrim(announcement_label) <> ''
	);
