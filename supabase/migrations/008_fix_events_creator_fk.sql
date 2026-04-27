-- ================================================================
-- 008: events.creator_id FK を auth.users → profiles に修正
-- queries.ts が profiles!events_creator_id_fkey でJOINするため
-- ================================================================

ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_creator_id_fkey;

ALTER TABLE events
    ADD CONSTRAINT events_creator_id_fkey
        FOREIGN KEY (creator_id)
        REFERENCES public.profiles(id)
        ON DELETE CASCADE;
