-- In-app exit survey for episode broadcast room experiment runs.
-- Keep the prerequisite experiment tables here as a defensive backfill for
-- environments where 088_room_experiment_analytics.sql has not been applied.

CREATE TABLE IF NOT EXISTS public.room_experiment_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    anime_id bigint NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ended_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    label text CHECK (label IS NULL OR char_length(label) <= 100),
    notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT room_experiment_runs_time_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS room_experiment_runs_one_active_per_anime
    ON public.room_experiment_runs (anime_id)
    WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS room_experiment_runs_started_idx
    ON public.room_experiment_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.room_experiment_visits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES public.room_experiment_runs(id) ON DELETE CASCADE,
    anime_id bigint NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    broadcast_room_session_id uuid NOT NULL REFERENCES public.broadcast_room_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    client_visit_key text NOT NULL CHECK (char_length(client_visit_key) BETWEEN 1 AND 120),
    entered_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    exited_at timestamptz,
    heartbeat_count integer NOT NULL DEFAULT 0 CHECK (heartbeat_count >= 0),
    user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT room_experiment_visits_seen_check CHECK (last_seen_at >= entered_at),
    CONSTRAINT room_experiment_visits_exit_check CHECK (exited_at IS NULL OR exited_at >= entered_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS room_experiment_visits_unique_client_visit
    ON public.room_experiment_visits (
        run_id,
        user_id,
        broadcast_room_session_id,
        client_visit_key
    );

CREATE INDEX IF NOT EXISTS room_experiment_visits_run_session_idx
    ON public.room_experiment_visits (run_id, broadcast_room_session_id);

CREATE INDEX IF NOT EXISTS room_experiment_visits_active_idx
    ON public.room_experiment_visits (run_id, last_seen_at DESC)
    WHERE exited_at IS NULL;

CREATE OR REPLACE FUNCTION public.touch_room_experiment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_experiment_runs_touch_updated_at ON public.room_experiment_runs;
CREATE TRIGGER room_experiment_runs_touch_updated_at
    BEFORE UPDATE ON public.room_experiment_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_room_experiment_updated_at();

DROP TRIGGER IF EXISTS room_experiment_visits_touch_updated_at ON public.room_experiment_visits;
CREATE TRIGGER room_experiment_visits_touch_updated_at
    BEFORE UPDATE ON public.room_experiment_visits
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_room_experiment_updated_at();

CREATE OR REPLACE FUNCTION public.validate_room_experiment_visit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    target_run public.room_experiment_runs%ROWTYPE;
    target_session public.broadcast_room_sessions%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.run_id IS DISTINCT FROM OLD.run_id
           OR NEW.anime_id IS DISTINCT FROM OLD.anime_id
           OR NEW.broadcast_room_session_id IS DISTINCT FROM OLD.broadcast_room_session_id
           OR NEW.user_id IS DISTINCT FROM OLD.user_id
           OR NEW.client_visit_key IS DISTINCT FROM OLD.client_visit_key
           OR NEW.entered_at IS DISTINCT FROM OLD.entered_at THEN
            RAISE EXCEPTION 'room experiment visit identity fields cannot be changed'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT * INTO target_run
        FROM public.room_experiment_runs
        WHERE id = NEW.run_id
        FOR UPDATE;
    ELSE
        SELECT * INTO target_run
        FROM public.room_experiment_runs
        WHERE id = NEW.run_id;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'room experiment run does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF TG_OP = 'INSERT' AND target_run.ended_at IS NOT NULL THEN
        RAISE EXCEPTION 'room experiment run is not active'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO target_session
    FROM public.broadcast_room_sessions
    WHERE id = NEW.broadcast_room_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'broadcast room session does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF target_session.room_kind <> 'episode' THEN
        RAISE EXCEPTION 'room experiment visits are only allowed for episode rooms'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.anime_id IS DISTINCT FROM target_run.anime_id
       OR NEW.anime_id IS DISTINCT FROM target_session.anime_id THEN
        RAISE EXCEPTION 'room experiment anime mismatch'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_experiment_visits_validate ON public.room_experiment_visits;
CREATE TRIGGER room_experiment_visits_validate
    BEFORE INSERT OR UPDATE ON public.room_experiment_visits
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_room_experiment_visit();

ALTER TABLE public.room_experiment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_experiment_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_experiment_runs_select_admin" ON public.room_experiment_runs;
CREATE POLICY "room_experiment_runs_select_admin"
    ON public.room_experiment_runs
    FOR SELECT
    TO authenticated
    USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "room_experiment_runs_insert_admin" ON public.room_experiment_runs;
CREATE POLICY "room_experiment_runs_insert_admin"
    ON public.room_experiment_runs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND public.is_current_user_admin()
    );

DROP POLICY IF EXISTS "room_experiment_runs_update_admin" ON public.room_experiment_runs;
CREATE POLICY "room_experiment_runs_update_admin"
    ON public.room_experiment_runs
    FOR UPDATE
    TO authenticated
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "room_experiment_visits_select_own_or_admin" ON public.room_experiment_visits;
CREATE POLICY "room_experiment_visits_select_own_or_admin"
    ON public.room_experiment_visits
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_current_user_admin()
    );

DROP POLICY IF EXISTS "room_experiment_visits_insert_own" ON public.room_experiment_visits;
CREATE POLICY "room_experiment_visits_insert_own"
    ON public.room_experiment_visits
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "room_experiment_visits_update_own" ON public.room_experiment_visits;
-- Visit updates are performed only through trusted server-side API helpers.

CREATE TABLE IF NOT EXISTS public.room_exit_survey_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    anime_id integer NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    broadcast_room_session_id uuid NOT NULL REFERENCES public.broadcast_room_sessions(id) ON DELETE CASCADE,
    experiment_run_id uuid NOT NULL REFERENCES public.room_experiment_runs(id) ON DELETE CASCADE,
    survey_version text NOT NULL DEFAULT 'room_exit_v1'
        CHECK (char_length(survey_version) BETWEEN 1 AND 40),
    stayed_seconds integer NOT NULL DEFAULT 0 CHECK (stayed_seconds >= 0),
    post_count integer NOT NULL DEFAULT 0 CHECK (post_count >= 0),
    overall_rating smallint CHECK (overall_rating BETWEEN 1 AND 5),
    shared_experience_rating smallint CHECK (shared_experience_rating BETWEEN 1 AND 5),
    readability_rating smallint CHECK (readability_rating BETWEEN 1 AND 5),
    next_participation text CHECK (
        next_participation IS NULL OR next_participation IN (
            'must_join',
            'want_join',
            'not_sure',
            'not_really',
            'not_join'
        )
    ),
    comparison_with_x text CHECK (
        comparison_with_x IS NULL OR comparison_with_x IN (
            'anipolis_better',
            'anipolis_slightly_better',
            'same',
            'x_slightly_better',
            'x_better',
            'cannot_compare'
        )
    ),
    good_points text CHECK (good_points IS NULL OR char_length(good_points) <= 1000),
    improvement_points text CHECK (improvement_points IS NULL OR char_length(improvement_points) <= 1000),
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    skipped boolean NOT NULL DEFAULT false,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT room_exit_survey_responses_required_answers_check CHECK (
        skipped
        OR (
            overall_rating IS NOT NULL
            AND shared_experience_rating IS NOT NULL
            AND readability_rating IS NOT NULL
            AND next_participation IS NOT NULL
            AND comparison_with_x IS NOT NULL
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS room_exit_survey_responses_user_session_version_uidx
    ON public.room_exit_survey_responses (user_id, broadcast_room_session_id, survey_version);

CREATE INDEX IF NOT EXISTS room_exit_survey_responses_anime_idx
    ON public.room_exit_survey_responses (anime_id);

CREATE INDEX IF NOT EXISTS room_exit_survey_responses_experiment_run_idx
    ON public.room_exit_survey_responses (experiment_run_id);

CREATE INDEX IF NOT EXISTS room_exit_survey_responses_session_idx
    ON public.room_exit_survey_responses (broadcast_room_session_id);

CREATE INDEX IF NOT EXISTS room_exit_survey_responses_submitted_at_idx
    ON public.room_exit_survey_responses (submitted_at DESC);

CREATE OR REPLACE FUNCTION public.validate_room_exit_survey_response()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    target_run public.room_experiment_runs%ROWTYPE;
    target_session public.broadcast_room_sessions%ROWTYPE;
BEGIN
    SELECT * INTO target_run
    FROM public.room_experiment_runs
    WHERE id = NEW.experiment_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'room experiment run does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT * INTO target_session
    FROM public.broadcast_room_sessions
    WHERE id = NEW.broadcast_room_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'broadcast room session does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF target_session.room_kind <> 'episode' THEN
        RAISE EXCEPTION 'room exit surveys are only allowed for episode rooms'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.anime_id IS DISTINCT FROM target_run.anime_id
       OR NEW.anime_id IS DISTINCT FROM target_session.anime_id THEN
        RAISE EXCEPTION 'room exit survey anime mismatch'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_exit_survey_responses_validate ON public.room_exit_survey_responses;
CREATE TRIGGER room_exit_survey_responses_validate
    BEFORE INSERT OR UPDATE ON public.room_exit_survey_responses
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_room_exit_survey_response();

ALTER TABLE public.room_exit_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_exit_survey_responses_insert_own" ON public.room_exit_survey_responses;
CREATE POLICY "room_exit_survey_responses_insert_own"
    ON public.room_exit_survey_responses
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "room_exit_survey_responses_select_own_or_admin" ON public.room_exit_survey_responses;
CREATE POLICY "room_exit_survey_responses_select_own_or_admin"
    ON public.room_exit_survey_responses
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_current_user_admin()
    );
