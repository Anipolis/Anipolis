-- イベントルームをリアタイルームと同じUI/機能基盤に統合するためのスキーマ変更。
-- 1) posts.event_id: イベント投稿をハッシュタグ一致ではなく直接リンクで取得できるようにする
-- 2) events.updated_at + 作成者/管理者UPDATEポリシー: イベント編集機能のため
-- 3) event_mutes / event_notification_settings: イベント専用の一回限りミュート・通知設定
-- 4) room_experiment_runs / room_experiment_visits / room_exit_survey_responses:
--    放送回ルーム検証(room-experiments)をイベントルームにも対応させる room_kind 判別列を追加

-- ================================================================
-- 1) posts.event_id
-- ================================================================
ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS posts_event_id_idx
    ON public.posts (event_id, created_at DESC)
    WHERE event_id IS NOT NULL;

-- ================================================================
-- 2) events テーブル: updated_at + 作成者/管理者による更新
-- ================================================================
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_touch_updated_at ON public.events;
CREATE TRIGGER events_touch_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_events_updated_at();

-- 作成者のみ更新可 -> 作成者または管理者が更新可（設定変更・削除(キャンセル)機能のため）
DROP POLICY IF EXISTS "作成者はイベントを更新可" ON public.events;
DROP POLICY IF EXISTS "作成者または管理者はイベントを更新可" ON public.events;
CREATE POLICY "作成者または管理者はイベントを更新可" ON public.events
    FOR UPDATE TO authenticated
    USING (creator_id = auth.uid() OR public.is_current_user_admin())
    WITH CHECK (creator_id = auth.uid() OR public.is_current_user_admin());

-- ================================================================
-- 3) event_mutes: イベント単位・一回限りのミュート(繰り返しなし)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.event_mutes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT event_mutes_user_event_unique UNIQUE (user_id, event_id)
);

ALTER TABLE public.event_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own event mutes" ON public.event_mutes;
CREATE POLICY "Users can manage their own event mutes"
    ON public.event_mutes
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS event_mutes_event_id_idx ON public.event_mutes (event_id);

-- ================================================================
-- 4) event_notification_settings: イベント開始前のリマインド通知設定
-- ================================================================
CREATE TABLE IF NOT EXISTS public.event_notification_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    notify_1min boolean NOT NULL DEFAULT false,
    notify_5min boolean NOT NULL DEFAULT false,
    notify_30min boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT event_notification_settings_user_event_unique UNIQUE (user_id, event_id)
);

ALTER TABLE public.event_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own event notification settings" ON public.event_notification_settings;
CREATE POLICY "Users can manage their own event notification settings"
    ON public.event_notification_settings
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_event_notification_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_notification_settings_touch_updated_at ON public.event_notification_settings;
CREATE TRIGGER event_notification_settings_touch_updated_at
    BEFORE UPDATE ON public.event_notification_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_event_notification_settings_updated_at();

-- ================================================================
-- 5) room_experiment_runs: イベントルームを対象にできるようにする
-- ================================================================
ALTER TABLE public.room_experiment_runs
    ALTER COLUMN anime_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS room_kind text NOT NULL DEFAULT 'episode'
        CHECK (room_kind IN ('episode', 'event'));

ALTER TABLE public.room_experiment_runs
    DROP CONSTRAINT IF EXISTS room_experiment_runs_target_check;
ALTER TABLE public.room_experiment_runs
    ADD CONSTRAINT room_experiment_runs_target_check CHECK (
        (room_kind = 'episode' AND anime_id IS NOT NULL AND event_id IS NULL) OR
        (room_kind = 'event'   AND event_id IS NOT NULL AND anime_id IS NULL)
    );

DROP INDEX IF EXISTS public.room_experiment_runs_one_active_per_anime;
CREATE UNIQUE INDEX IF NOT EXISTS room_experiment_runs_one_active_per_anime
    ON public.room_experiment_runs (anime_id)
    WHERE ended_at IS NULL AND anime_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS room_experiment_runs_one_active_per_event
    ON public.room_experiment_runs (event_id)
    WHERE ended_at IS NULL AND event_id IS NOT NULL;

-- ================================================================
-- 6) room_experiment_visits: イベントルームへの訪問記録に対応
-- ================================================================
ALTER TABLE public.room_experiment_visits
    ALTER COLUMN broadcast_room_session_id DROP NOT NULL,
    ALTER COLUMN anime_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS room_kind text NOT NULL DEFAULT 'episode'
        CHECK (room_kind IN ('episode', 'event'));

ALTER TABLE public.room_experiment_visits
    DROP CONSTRAINT IF EXISTS room_experiment_visits_target_check;
ALTER TABLE public.room_experiment_visits
    ADD CONSTRAINT room_experiment_visits_target_check CHECK (
        (room_kind = 'episode' AND broadcast_room_session_id IS NOT NULL AND event_id IS NULL) OR
        (room_kind = 'event'   AND event_id IS NOT NULL AND broadcast_room_session_id IS NULL)
    );

DROP INDEX IF EXISTS public.room_experiment_visits_unique_client_visit;
CREATE UNIQUE INDEX IF NOT EXISTS room_experiment_visits_unique_client_visit_session
    ON public.room_experiment_visits (run_id, user_id, broadcast_room_session_id, client_visit_key)
    WHERE broadcast_room_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS room_experiment_visits_unique_client_visit_event
    ON public.room_experiment_visits (run_id, user_id, event_id, client_visit_key)
    WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS room_experiment_visits_run_event_idx
    ON public.room_experiment_visits (run_id, event_id)
    WHERE event_id IS NOT NULL;

-- validate_room_experiment_visit(): room_kind で分岐(episodeは既存ロジック、eventはevents参照)
CREATE OR REPLACE FUNCTION public.validate_room_experiment_visit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    target_run public.room_experiment_runs%ROWTYPE;
    target_session public.broadcast_room_sessions%ROWTYPE;
    target_event public.events%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.run_id IS DISTINCT FROM OLD.run_id
           OR NEW.anime_id IS DISTINCT FROM OLD.anime_id
           OR NEW.event_id IS DISTINCT FROM OLD.event_id
           OR NEW.room_kind IS DISTINCT FROM OLD.room_kind
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

    IF NEW.room_kind IS DISTINCT FROM target_run.room_kind THEN
        RAISE EXCEPTION 'room experiment visit kind does not match run kind'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.room_kind = 'episode' THEN
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
    ELSE
        SELECT * INTO target_event
        FROM public.events
        WHERE id = NEW.event_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'event does not exist'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF target_event.is_cancelled THEN
            RAISE EXCEPTION 'room experiment visits are not allowed for cancelled events'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.event_id IS DISTINCT FROM target_run.event_id THEN
            RAISE EXCEPTION 'room experiment event mismatch'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ================================================================
-- 7) room_exit_survey_responses: イベントルーム退室アンケートに対応
-- ================================================================
ALTER TABLE public.room_exit_survey_responses
    ALTER COLUMN broadcast_room_session_id DROP NOT NULL,
    ALTER COLUMN anime_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS room_kind text NOT NULL DEFAULT 'episode'
        CHECK (room_kind IN ('episode', 'event'));

ALTER TABLE public.room_exit_survey_responses
    DROP CONSTRAINT IF EXISTS room_exit_survey_responses_target_check;
ALTER TABLE public.room_exit_survey_responses
    ADD CONSTRAINT room_exit_survey_responses_target_check CHECK (
        (room_kind = 'episode' AND broadcast_room_session_id IS NOT NULL AND event_id IS NULL) OR
        (room_kind = 'event'   AND event_id IS NOT NULL AND broadcast_room_session_id IS NULL)
    );

DROP INDEX IF EXISTS public.room_exit_survey_responses_user_session_version_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS room_exit_survey_responses_user_session_version_uidx
    ON public.room_exit_survey_responses (user_id, broadcast_room_session_id, survey_version)
    WHERE broadcast_room_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS room_exit_survey_responses_user_event_version_uidx
    ON public.room_exit_survey_responses (user_id, event_id, survey_version)
    WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS room_exit_survey_responses_event_idx
    ON public.room_exit_survey_responses (event_id)
    WHERE event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_room_exit_survey_response()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    target_run public.room_experiment_runs%ROWTYPE;
    target_session public.broadcast_room_sessions%ROWTYPE;
    target_event public.events%ROWTYPE;
BEGIN
    SELECT * INTO target_run
    FROM public.room_experiment_runs
    WHERE id = NEW.experiment_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'room experiment run does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.room_kind IS DISTINCT FROM target_run.room_kind THEN
        RAISE EXCEPTION 'room exit survey kind does not match run kind'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.room_kind = 'episode' THEN
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
    ELSE
        SELECT * INTO target_event
        FROM public.events
        WHERE id = NEW.event_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'event does not exist'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF NEW.event_id IS DISTINCT FROM target_run.event_id THEN
            RAISE EXCEPTION 'room exit survey event mismatch'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- room_exit_survey_responses_insert_own ポリシーはvisitの存在確認をevent_id/session_idどちらでも通す必要があるため再定義
DROP POLICY IF EXISTS "room_exit_survey_responses_insert_own" ON public.room_exit_survey_responses;
CREATE POLICY "room_exit_survey_responses_insert_own"
    ON public.room_exit_survey_responses
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.room_experiment_visits visit
            WHERE visit.run_id = room_exit_survey_responses.experiment_run_id
              AND visit.user_id = auth.uid()
              AND (
                    (room_exit_survey_responses.room_kind = 'episode'
                     AND visit.broadcast_room_session_id = room_exit_survey_responses.broadcast_room_session_id)
                 OR (room_exit_survey_responses.room_kind = 'event'
                     AND visit.event_id = room_exit_survey_responses.event_id)
              )
        )
    );
