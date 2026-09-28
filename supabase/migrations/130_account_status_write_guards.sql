-- ============================================================
-- 130_account_status_write_guards: 停止・制限中アカウントの書き込みを DB 境界で止める（#232, #233）
-- ============================================================
-- 118 でクローズドβの書き込みガード has_beta_write_access() を各ポリシーに入れたが、
-- 39 で導入した is_profile_active_for_writes()（停止・期限内制限の検査）が抜けている経路が
-- 残っていた。β権限を持つ停止・制限中アカウントが REST/RPC を直接叩くと、招待の発行、
-- 公開マイリストの更新（フォロワーへの通知トリガー付き）、おすすめの送信（通知付き）、
-- 通報、アニメトレードの開始（マッチ通知付き）を続けられた。
--
-- 方針:
--   * 他ユーザーや公開面に影響する書き込みは「β権限 AND アカウント状態」の両方を要求する。
--     posts / likes / reposts / follows / follow_requests / bookmarks / storage は 118・128 で対応済み。
--     ここでは user_anime_list, anime_recommendations, reports, invites(RPC), anime_exchange(RPC) を揃える。
--   * 本人にしか影響しない設定（muted_words, anime_mutes, event_mutes, broadcast_room_mutes,
--     各種通知設定・購読, ルーム計測）は β ガードのみのまま残す。制限中でも自分の表示を
--     調整できる方が安全で、通知やコンテンツの拡散を伴わないため。
--   * 通知トリガー（110 mylist, 031 recommendation, 111 exchange match）は行の INSERT/UPDATE が
--     RLS/RPC で拒否されれば発火しないので、トリガー側の変更は不要。
--   * 制限期限を過ぎた restricted は is_profile_active_for_writes が true を返すため、自動解除される。

-- ---------- user_anime_list ----------
DROP POLICY IF EXISTS "user_anime_list: 自分のみ編集可能" ON public.user_anime_list;
CREATE POLICY "user_anime_list: 自分のみ編集可能"
    ON public.user_anime_list FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(user_id)
    );

DROP POLICY IF EXISTS "user_anime_list: 自分のみ更新可能" ON public.user_anime_list;
CREATE POLICY "user_anime_list: 自分のみ更新可能"
    ON public.user_anime_list FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(user_id)
    );

-- ---------- anime_recommendations ----------
DROP POLICY IF EXISTS "anime_recommendations: users can insert own recommendations"
    ON public.anime_recommendations;
CREATE POLICY "anime_recommendations: users can insert own recommendations"
    ON public.anime_recommendations FOR INSERT
    WITH CHECK (
        auth.uid() = recommender_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(recommender_id)
    );

-- ---------- reports ----------
DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
    FOR INSERT WITH CHECK (
        auth.uid() = reporter_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(reporter_id)
    );

-- ---------- create_invite (116 の本体にアカウント状態検査を追加) ----------
CREATE OR REPLACE FUNCTION public.create_invite(
    p_max_uses integer DEFAULT 1,
    p_expires_at timestamptz DEFAULT NULL
)
RETURNS text AS $$
DECLARE
    current_user_id uuid := auth.uid();
    caller_is_admin boolean;
    caller_is_beta_member boolean;
    normalized_max_uses integer := GREATEST(1, COALESCE(p_max_uses, 1));
    normalized_expires_at timestamptz := p_expires_at;
    active_invite_count integer;
    generated_code text;
    attempt integer := 0;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    -- 停止・期限内制限中のアカウントに招待を発行させない（#233）。
    -- β権限だけを見ていたため、制限中でもコードを配って新規参加者を増やせた。
    IF NOT public.is_profile_active_for_writes(current_user_id) THEN
        RAISE EXCEPTION 'account restricted' USING DETAIL = 'INVITE_ACCOUNT_RESTRICTED';
    END IF;

    caller_is_admin := public.is_current_user_admin();
    caller_is_beta_member := COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'beta_member')::boolean,
        false
    );

    IF NOT caller_is_admin AND NOT caller_is_beta_member THEN
        -- β許可を持たないユーザーに発行させると自己招待でゲートを迂回できる
        RAISE EXCEPTION 'beta membership required' USING DETAIL = 'INVITE_FORBIDDEN';
    END IF;

    IF NOT caller_is_admin THEN
        -- 非管理者は1コードあたり最大10回まで、有効期限は最長30日にクランプ
        normalized_max_uses := LEAST(normalized_max_uses, 10);
        normalized_expires_at := LEAST(COALESCE(normalized_expires_at, now() + interval '30 days'), now() + interval '30 days');

        SELECT count(*)
          INTO active_invite_count
          FROM public.invites i
         WHERE i.created_by = current_user_id
           AND i.revoked_at IS NULL
           AND i.use_count < i.max_uses
           AND (i.expires_at IS NULL OR i.expires_at > now());

        IF active_invite_count >= 3 THEN
            RAISE EXCEPTION 'invite creation limit reached'
                USING DETAIL = 'INVITE_CREATE_LIMIT';
        END IF;
    END IF;

    LOOP
        attempt := attempt + 1;
        generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

        BEGIN
            INSERT INTO public.invites (code, created_by, max_uses, expires_at)
            VALUES (generated_code, current_user_id, normalized_max_uses, normalized_expires_at);
            RETURN generated_code;
        EXCEPTION WHEN unique_violation THEN
            IF attempt >= 5 THEN
                RAISE EXCEPTION 'failed to generate a unique invite code';
            END IF;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_invite(integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invite(integer, timestamptz) TO authenticated, service_role;

-- ---------- create_anime_exchange (111 の本体にβ参加・アカウント状態検査を追加) ----------
CREATE OR REPLACE FUNCTION public.create_anime_exchange(
    p_anime_id bigint,
    p_comment text DEFAULT NULL,
    p_subjective_tags text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
    exchange_id uuid,
    received_entry_id uuid,
    received_anime_id bigint
) AS $$
DECLARE
    current_user_id uuid := auth.uid();
    waiting_entry public.anime_exchange_entries%ROWTYPE;
    new_entry_id uuid;
    normalized_comment text := NULLIF(trim(p_comment), '');
    normalized_subjective_tags text[] := ARRAY[]::text[];
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    -- 画面の action を通らず RPC を直接呼ばれても、β参加とアカウント状態を DB 境界で強制する（#232）。
    -- 通常経路の ensureAccountCanWrite と同じ判定で、未参加・停止・制限中はエントリを作らず通知も発生させない。
    IF NOT public.has_beta_write_access() THEN
        RAISE EXCEPTION 'beta membership required' USING DETAIL = 'ANIME_EXCHANGE_FORBIDDEN';
    END IF;
    IF NOT public.is_profile_active_for_writes(current_user_id) THEN
        RAISE EXCEPTION 'account restricted' USING DETAIL = 'ANIME_EXCHANGE_ACCOUNT_RESTRICTED';
    END IF;

    IF normalized_comment IS NOT NULL AND char_length(normalized_comment) > 120 THEN
        RAISE EXCEPTION 'comment too long';
    END IF;

    WITH normalized AS (
        SELECT trim(input.tag) AS tag, min(input.ordinal) AS ordinal
          FROM unnest(COALESCE(p_subjective_tags, ARRAY[]::text[])) WITH ORDINALITY AS input(tag, ordinal)
         WHERE trim(input.tag) <> ''
         GROUP BY trim(input.tag)
    )
    SELECT COALESCE(array_agg(tag ORDER BY ordinal), ARRAY[]::text[])
      INTO normalized_subjective_tags
      FROM normalized;

    IF cardinality(normalized_subjective_tags) > 3 THEN
        RAISE EXCEPTION 'too many subjective tags';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM unnest(normalized_subjective_tags) AS selected(tag)
         WHERE NOT (selected.tag = ANY (ARRAY[
            '泣ける',
            '心温まる',
            '胸熱',
            '燃える',
            '尊い',
            '癒される',
            '切ない',
            '感動',
            '爽快',
            'ドキドキ',
            '怖い',
            '狂気',
            '脳破壊',
            '考察したくなる',
            '中毒性高い',
            '哲学的',
            '笑える',
            '美しい',
            '学び',
            '懐かしい'
         ]::text[]))
    ) THEN
        RAISE EXCEPTION 'invalid subjective tag';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.anime
         WHERE id = p_anime_id
           AND (NOT hidden_by_admin OR public.is_current_user_admin())
    ) THEN
        RAISE EXCEPTION 'anime exchange rejected'
            USING DETAIL = 'ANIME_EXCHANGE_ANIME_NOT_FOUND';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('public.anime_exchange_entries'));

    IF EXISTS (
        SELECT 1
          FROM public.anime_exchange_entries entry
         WHERE entry.user_id = current_user_id
           AND entry.status = 'waiting'
    ) THEN
        RAISE EXCEPTION 'anime exchange rejected'
            USING DETAIL = 'ANIME_EXCHANGE_WAITING_EXISTS';
    END IF;

    SELECT *
      INTO waiting_entry
      FROM public.anime_exchange_entries entry
     WHERE entry.status = 'waiting'
       AND entry.user_id <> current_user_id
       AND EXISTS (
           SELECT 1
             FROM public.anime anime
            WHERE anime.id = entry.anime_id
              AND (NOT anime.hidden_by_admin OR public.is_current_user_admin())
       )
     ORDER BY entry.created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;

    INSERT INTO public.anime_exchange_entries (user_id, anime_id, comment, subjective_tags)
    VALUES (current_user_id, p_anime_id, normalized_comment, normalized_subjective_tags)
    RETURNING id INTO new_entry_id;

    IF waiting_entry.id IS NOT NULL THEN
        UPDATE public.anime_exchange_entries
           SET status = 'matched',
               received_entry_id = waiting_entry.id,
               matched_at = now()
         WHERE id = new_entry_id;

        UPDATE public.anime_exchange_entries
           SET status = 'matched',
               received_entry_id = new_entry_id,
               matched_at = now()
         WHERE id = waiting_entry.id;

        -- 待機画面に移行していた側（waiting_entry.user_id）へマッチ通知。
        -- 受け取るアニメは今リクエストした本人が出した p_anime_id。
        -- 即マッチした本人（current_user_id）へは通知しない。
        INSERT INTO public.notifications (recipient_id, actor_id, type, exchange_anime_id)
        VALUES (waiting_entry.user_id, NULL, 'exchange_matched', p_anime_id);

        exchange_id := new_entry_id;
        received_entry_id := waiting_entry.id;
        received_anime_id := waiting_entry.anime_id;
    ELSE
        exchange_id := new_entry_id;
        received_entry_id := NULL;
        received_anime_id := NULL;
    END IF;

    -- received_entry_id は OUT パラメータ名と衝突するため、必ずテーブル別名で修飾する
    -- （無修飾だと 42702 "column reference is ambiguous" でトレード全体が失敗する）
    DELETE FROM public.anime_exchange_entries AS target
     WHERE target.user_id = current_user_id
       AND target.status = 'cancelled'
       AND target.received_entry_id IS NULL
       AND target.id NOT IN (
           SELECT keep.id FROM public.anime_exchange_entries AS keep
            WHERE keep.user_id = current_user_id
              AND keep.status = 'cancelled'
              AND keep.received_entry_id IS NULL
            ORDER BY keep.created_at DESC
            LIMIT 5
       );

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- PUBLIC への暗黙の EXECUTE を明示的に外し、必要な role にだけ付与する
REVOKE ALL ON FUNCTION public.create_anime_exchange(bigint, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_anime_exchange(bigint, text, text[]) TO authenticated, service_role;
