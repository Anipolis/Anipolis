-- Allow late-night anime broadcast notation such as 26:00.
-- PostgreSQL time cannot store 24:00+ values, so keep the display notation as text.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'anime'
      AND column_name = 'broadcast_time'
      AND data_type = 'time without time zone'
  ) THEN
    ALTER TABLE anime
      ALTER COLUMN broadcast_time TYPE text
      USING CASE
        WHEN broadcast_time IS NULL THEN NULL
        ELSE to_char(broadcast_time, 'HH24:MI')
      END;
  END IF;
END $$;

ALTER TABLE anime
  DROP CONSTRAINT IF EXISTS anime_broadcast_time_format;

ALTER TABLE anime
  ADD CONSTRAINT anime_broadcast_time_format
  CHECK (
    broadcast_time IS NULL OR broadcast_time ~ '^([01]?[0-9]|2[0-6]):[0-5][0-9]$'
  );
