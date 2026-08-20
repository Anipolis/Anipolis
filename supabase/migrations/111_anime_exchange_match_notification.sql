-- ================================================================
-- 111_anime_exchange_match_notification.sql
-- 通知タイプに exchange_matched（アニメトレードのマッチ成立）を追加する。
--
-- トレードで「待機画面に移行していた」ユーザー（= 既存の waiting エントリの
-- 持ち主）が、あとから来た別ユーザーとマッチした時に通知する。
-- すぐにマッチした本人（今まさにリクエストしているユーザー）には通知しない。
-- トレードは匿名のため actor は持たせない。
-- ================================================================

-- ----------------------------------------------------------------
-- カラム追加: マッチで受け取ったアニメ
-- ----------------------------------------------------------------
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS exchange_anime_id bigint REFERENCES public.anime(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- type の CHECK 制約に 'exchange_matched' を追加
-- ----------------------------------------------------------------
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'like',
        'repost',
        'reply',
        'mention',
        'follow',
        'follow_request',
        'anime_recommendation',
        'broadcast',
        'mylist_status',
        'exchange_matched'
    ));

-- 未読取得高速化の部分インデックス
CREATE INDEX IF NOT EXISTS notifications_unread_exchange_recipient_idx
    ON public.notifications (recipient_id, created_at DESC)
    WHERE type = 'exchange_matched' AND NOT read;

-- ----------------------------------------------------------------
-- create_anime_exchange を再定義（086 の本体 + マッチ通知の INSERT）
-- ----------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.create_anime_exchange(bigint, text, text[]) TO authenticated;
