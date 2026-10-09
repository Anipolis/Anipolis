-- ============================================================
-- 131_broadcast_room_episode_correction: 開場済みセッションの話数訂正を専用 RPC でだけ許す（#246）
-- ============================================================
-- 104 の凍結トリガーは、開場済み（posting_opens_at 到来・投稿あり・schedule_frozen_at 設定済み）の
-- セッションで episode_number / episode_title / source_snapshot の変更も拒否する。実況ログの
-- 整合性を守るためで正しいが、しょぼいの Count 誤り（重複・別シリーズの混入）で付いた
-- 誤った話数を後から外せない。
--
-- 話数の訂正だけを通す経路として、service_role 専用の RPC を用意する。RPC はトランザクション
-- ローカルの設定値を立ててから UPDATE し、トリガーはその設定値が立っているときに限り
-- episode_number / episode_title / source_snapshot の差分を許可する。room_date や scheduled_at
-- など枠そのものは従来どおり凍結されたまま。

CREATE OR REPLACE FUNCTION public.protect_frozen_broadcast_room_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    is_frozen boolean;
    -- correct_broadcast_room_session_episode() が同一トランザクション内で立てる
    episode_correction boolean := COALESCE(current_setting('app.broadcast_room_episode_correction', true), '') = 'on';
BEGIN
    is_frozen := OLD.schedule_frozen_at IS NOT NULL
        OR OLD.posting_opens_at <= now()
        OR EXISTS (
            SELECT 1 FROM public.posts post WHERE post.broadcast_room_session_id = OLD.id
        );

    IF is_frozen AND (
        NEW.room_date IS DISTINCT FROM OLD.room_date
        OR NEW.room_kind IS DISTINCT FROM OLD.room_kind
        OR NEW.room_key IS DISTINCT FROM OLD.room_key
        OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
        OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
        OR NEW.posting_opens_at IS DISTINCT FROM OLD.posting_opens_at
        OR NEW.posting_closes_at IS DISTINCT FROM OLD.posting_closes_at
        OR NEW.schedule_source IS DISTINCT FROM OLD.schedule_source
        OR NEW.source_program_id IS DISTINCT FROM OLD.source_program_id
        OR NEW.source_title_id IS DISTINCT FROM OLD.source_title_id
        OR NEW.source_channel_id IS DISTINCT FROM OLD.source_channel_id
        OR NEW.source_channel_name IS DISTINCT FROM OLD.source_channel_name
        OR (
            NOT episode_correction
            AND (
                NEW.episode_number IS DISTINCT FROM OLD.episode_number
                OR NEW.episode_title IS DISTINCT FROM OLD.episode_title
                OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
            )
        )
    ) THEN
        RAISE EXCEPTION 'broadcast room schedule is frozen for session %', OLD.id
            USING ERRCODE = '23514';
    END IF;

    IF is_frozen AND NEW.schedule_frozen_at IS NULL THEN
        NEW.schedule_frozen_at := COALESCE(OLD.schedule_frozen_at, OLD.posting_opens_at, now());
    END IF;
    RETURN NEW;
END;
$$;

-- 話数訂正 RPC。監査スクリプト（scripts/audit-episode-numbers.ts --apply）が service_role で呼ぶ。
-- p_anomaly には元の Count と却下理由を渡し、source_snapshot.episode_anomaly に残す。
CREATE OR REPLACE FUNCTION public.correct_broadcast_room_session_episode(
    p_session_id uuid,
    p_episode_number integer,
    p_anomaly jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_count integer;
BEGIN
    IF p_session_id IS NULL THEN
        RAISE EXCEPTION 'session id required';
    END IF;

    -- トランザクションローカル（is_local = true）なので、この呼び出しの外には漏れない
    PERFORM set_config('app.broadcast_room_episode_correction', 'on', true);

    UPDATE public.broadcast_room_sessions
       SET episode_number = p_episode_number,
           source_snapshot = CASE
               WHEN p_anomaly IS NULL THEN source_snapshot
               ELSE COALESCE(source_snapshot, '{}'::jsonb) || jsonb_build_object('episode_anomaly', p_anomaly)
           END
     WHERE id = p_session_id;
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_broadcast_room_session_episode(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_broadcast_room_session_episode(uuid, integer, jsonb) TO service_role;
