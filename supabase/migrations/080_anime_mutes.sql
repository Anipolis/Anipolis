-- Anime-level mute table (replaces room-level broadcast_room_mutes)
-- user_id + anime_id unique: 1 record per user per anime
CREATE TABLE IF NOT EXISTS anime_mutes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    anime_id bigint NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    mute_type text NOT NULL CHECK (mute_type IN ('period', 'always')),
    period_days integer CHECK (period_days >= 1 AND period_days <= 7),
    is_repeat boolean NOT NULL DEFAULT false,
    muted_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT anime_mutes_user_anime_unique UNIQUE (user_id, anime_id),
    CONSTRAINT anime_mutes_period_requires_days CHECK (mute_type != 'period' OR period_days IS NOT NULL)
);

ALTER TABLE anime_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own anime mutes"
    ON anime_mutes
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
