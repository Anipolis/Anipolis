-- ============================================================
-- 150_account_deletion_followups: 退会で消えてはいけない記録を残し、ユーザー名を30日保留する
--   （#364 / #365 / #363）
-- ============================================================
-- 退会は auth.users の削除で profiles 以下を連鎖削除する（142）。このとき次の問題があった。
--
-- 1) #364 invites.created_by が ON DELETE CASCADE だったため、退会者が発行した招待が消え、
--    それに紐づく invite_redemptions（招待された第三者の記録）まで消えていた。
--    → created_by を NULL にして招待と利用記録を残す（142 の room_experiment_runs と同じ形）。
--      発行者がいなくなった招待は、未使用分を退会時に失効させる（退会者のリンクで参加させない）。
--      created_by = auth.uid() を使う RLS・発行上限の集計は NULL では一致しないので、
--      発行者のいない招待は管理者だけが扱える状態になる（意図どおり）。
--
-- 2) #365 reports.reporter_id が ON DELETE CASCADE だったため、通報した人が退会すると
--    未処理の通報も消えていた。→ reporter_id を NULL にして通報の内容と対象を残す。
--      reports_insert_own（auth.uid() = reporter_id）は NULL の行を作れないので影響しない。
--      reports_open_unique_idx は NULL 同士を別の値として扱うので、退会者の通報同士は衝突しない。
--      reports_no_self_user_report も NULL では true になる。
--
-- 3) #363 退会するとユーザー名の UNIQUE が外れ、直後に別人が同じ名前を取れた
--    （過去のメンションや外部に貼られたプロフィール URL が別人を指し、なりすましに使える）。
--    → 退会したユーザー名を30日間保留する。保持するのはユーザー名（小文字）と退会日時だけで、
--      30日を過ぎた行は退会処理と日次の定期処理で削除する。
--      保留中の名前での登録・変更は、既存の重複と同じ SQLSTATE 23505 で拒否する
--      （アプリの「すでに使用されています」の表示がそのまま使える）。
--      ユーザー名の変更で手放した名前は対象外（別途判断）。

-- ----------------------------------------------------------------
-- 1) invites.created_by: CASCADE → SET NULL
-- ----------------------------------------------------------------
ALTER TABLE public.invites
    ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.invites
    DROP CONSTRAINT IF EXISTS invites_created_by_fkey;

ALTER TABLE public.invites
    ADD CONSTRAINT invites_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 発行者の確認は NULL でも「本人ではない」と判定されるようにする
-- （<> は NULL を返し、IF が素通りしていた）。本文は 112 と同じ。
CREATE OR REPLACE FUNCTION public.revoke_invite(p_invite_id uuid)
RETURNS void AS $$
DECLARE
    current_user_id uuid := auth.uid();
    target_invite public.invites%ROWTYPE;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    SELECT * INTO target_invite FROM public.invites WHERE id = p_invite_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'invite not found';
    END IF;

    IF target_invite.created_by IS DISTINCT FROM current_user_id AND NOT public.is_current_user_admin() THEN
        RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;

    UPDATE public.invites SET revoked_at = now() WHERE id = p_invite_id AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------
-- 2) reports.reporter_id: CASCADE → SET NULL
--    制約名はアプリの埋め込み（profiles!reports_reporter_id_fkey）が参照するので変えない
-- ----------------------------------------------------------------
ALTER TABLE public.reports
    ALTER COLUMN reporter_id DROP NOT NULL;

ALTER TABLE public.reports
    DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey;

ALTER TABLE public.reports
    ADD CONSTRAINT reports_reporter_id_fkey
    FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- 3) 退会したユーザー名の保留
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.released_usernames (
    username text PRIMARY KEY CHECK (username = lower(username)),
    released_at timestamptz NOT NULL DEFAULT now()
);

-- 書き込みも読み取りも下の SECURITY DEFINER の関数からだけ。直接の参照は誰にも許可しない。
ALTER TABLE public.released_usernames ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.released_usernames IS
    'Usernames of deleted accounts, held for 30 days to prevent impersonation. Rows older than 30 days are purged.';

CREATE OR REPLACE FUNCTION public.is_username_held(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.released_usernames r
        WHERE r.username = lower(p_username)
          AND r.released_at > now() - interval '30 days'
    );
$$;

REVOKE ALL ON FUNCTION public.is_username_held(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_held(text) TO service_role;

-- 登録・オンボーディングの事前確認用。使われている名前と保留中の名前のどちらも「使えない」と返す。
-- profiles は誰でも読めるので、返す真偽値は既存の公開情報に保留の有無が加わるだけ。
CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT char_length(p_username) BETWEEN 3 AND 20
        AND NOT EXISTS (
            SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(p_username)
        )
        AND NOT public.is_username_held(p_username);
$$;

REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_released_usernames()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    purged integer;
BEGIN
    DELETE FROM public.released_usernames
     WHERE released_at <= now() - interval '30 days';
    GET DIAGNOSTICS purged = ROW_COUNT;
    RETURN purged;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_released_usernames() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_released_usernames() TO service_role;

-- 保留中の名前での登録・変更を拒否する
CREATE OR REPLACE FUNCTION public.enforce_username_not_held()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND lower(NEW.username) = lower(OLD.username) THEN
        RETURN NEW;
    END IF;

    IF public.is_username_held(NEW.username) THEN
        -- メッセージに username を含める（オンボーディングはこれで項目を判別する）
        RAISE EXCEPTION 'username is held after account deletion'
            USING ERRCODE = '23505',
                  HINT = '退会したアカウントのユーザー名は30日間使えません';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_username_not_held ON public.profiles;
CREATE TRIGGER enforce_username_not_held
    BEFORE INSERT OR UPDATE OF username ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_username_not_held();

-- 退会時: ユーザー名を保留し、未使用の招待を失効させる。
-- BEFORE で行うのは、AFTER だと invites.created_by が先に NULL にされ、退会者の招待を引けないため。
CREATE OR REPLACE FUNCTION public.handle_profile_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.released_usernames (username, released_at)
    VALUES (lower(OLD.username), now())
    ON CONFLICT (username) DO UPDATE SET released_at = EXCLUDED.released_at;

    UPDATE public.invites
       SET revoked_at = now()
     WHERE created_by = OLD.id
       AND revoked_at IS NULL;

    PERFORM public.purge_released_usernames();

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS handle_profile_deletion ON public.profiles;
CREATE TRIGGER handle_profile_deletion
    BEFORE DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_profile_deletion();

-- 退会が無い期間も30日で消えるよう、日次で掃除する（070 と同じく pg_cron）
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'purge-released-usernames',
    '17 4 * * *',
    $$SELECT public.purge_released_usernames()$$
);
