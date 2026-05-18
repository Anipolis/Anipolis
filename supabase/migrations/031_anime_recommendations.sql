-- Anime recommendations from one user to another.

CREATE TABLE IF NOT EXISTS public.anime_recommendations (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recommender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    anime_id       bigint NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (recommender_id <> recipient_id)
);

ALTER TABLE public.anime_recommendations
    DROP COLUMN IF EXISTS message;

CREATE INDEX IF NOT EXISTS idx_anime_recommendations_recipient
    ON public.anime_recommendations (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anime_recommendations_recommender_daily
    ON public.anime_recommendations (recommender_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anime_recommendations_anime
    ON public.anime_recommendations (anime_id);

ALTER TABLE public.anime_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anime_recommendations: participants can select"
    ON public.anime_recommendations;

CREATE POLICY "anime_recommendations: participants can select"
    ON public.anime_recommendations FOR SELECT
    USING (auth.uid() = recommender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "anime_recommendations: users can insert own recommendations"
    ON public.anime_recommendations;

CREATE POLICY "anime_recommendations: users can insert own recommendations"
    ON public.anime_recommendations FOR INSERT
    WITH CHECK (auth.uid() = recommender_id);

CREATE OR REPLACE FUNCTION public.validate_anime_recommendation()
RETURNS TRIGGER AS $$
DECLARE
    recipient_status text;
    todays_count integer;
BEGIN
    IF NEW.recommender_id <> auth.uid() THEN
        RAISE EXCEPTION 'recommendations can only be sent by the current user';
    END IF;

    SELECT status INTO recipient_status
    FROM public.user_anime_list
    WHERE user_id = NEW.recipient_id
      AND anime_id = NEW.anime_id;

    IF recipient_status IN ('watching', 'completed') THEN
        RAISE EXCEPTION 'recipient is already watching or completed this anime';
    END IF;

    SELECT count(*) INTO todays_count
    FROM public.anime_recommendations
    WHERE recommender_id = NEW.recommender_id
      AND recipient_id = NEW.recipient_id
      AND (created_at AT TIME ZONE 'Asia/Tokyo')::date = (now() AT TIME ZONE 'Asia/Tokyo')::date;

    IF todays_count >= 3 THEN
        RAISE EXCEPTION 'daily recommendation limit reached for this recipient';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS validate_anime_recommendation_before_insert
    ON public.anime_recommendations;

CREATE TRIGGER validate_anime_recommendation_before_insert
    BEFORE INSERT ON public.anime_recommendations
    FOR EACH ROW EXECUTE FUNCTION public.validate_anime_recommendation();

DO $$
BEGIN
    IF to_regclass('public.notifications') IS NULL THEN
        RAISE NOTICE 'public.notifications does not exist; skipping anime recommendation notification wiring.';
        RETURN;
    END IF;

    EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS anime_recommendation_id uuid';

    EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_anime_recommendation_id_fkey';

    EXECUTE '
        ALTER TABLE public.notifications
        ADD CONSTRAINT notifications_anime_recommendation_id_fkey
        FOREIGN KEY (anime_recommendation_id)
        REFERENCES public.anime_recommendations(id)
        ON DELETE CASCADE
    ';

    EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check';

    EXECUTE '
        ALTER TABLE public.notifications
        ADD CONSTRAINT notifications_type_check
        CHECK (type IN (''like'', ''repost'', ''reply'', ''mention'', ''follow'', ''anime_recommendation''))
    ';

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_anime_recommendation ON public.notifications (anime_recommendation_id)';

    EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.notify_on_anime_recommendation()
    RETURNS TRIGGER AS $body$
    BEGIN
        INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, anime_recommendation_id)
        VALUES (NEW.recipient_id, NEW.recommender_id, 'anime_recommendation', NULL, NEW.id);
        RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    $sql$;

    EXECUTE 'DROP TRIGGER IF EXISTS on_anime_recommendation_notify ON public.anime_recommendations';

    EXECUTE '
    CREATE TRIGGER on_anime_recommendation_notify
        AFTER INSERT ON public.anime_recommendations
        FOR EACH ROW EXECUTE FUNCTION public.notify_on_anime_recommendation()
    ';
END;
$$;
