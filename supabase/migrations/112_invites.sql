-- ================================================================
-- 112_invites.sql
-- 招待コードによるクローズドβアクセス許可。
--
-- Discord サーバー所属検証に加えて、招待コード（回数制限付き共有リンク）
-- でも app_metadata.beta_member を付与できるようにする。管理者・一般メンバー
-- のどちらも発行可能（一般メンバーは上限回数・同時発行数を本関数側でクランプ）。
-- app_metadata の実際の書き込みはアプリケーション側（service role）で行うため、
-- ここでは「招待コードの正当性チェックと消費」のみを扱う。
-- ================================================================

-- ----------------------------------------------------------------
-- invites: 発行された招待コード
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invites_created_by_idx ON public.invites (created_by);

-- ----------------------------------------------------------------
-- invite_redemptions: どのユーザーがどの招待で許可を得たかの記録
-- 1ユーザーにつき許可付与は1回で十分なので user_id を UNIQUE にする。
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invite_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_id uuid NOT NULL REFERENCES public.invites(id) ON DELETE CASCADE,
    user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_redemptions_invite_id_idx ON public.invite_redemptions (invite_id);

-- ----------------------------------------------------------------
-- RLS: 直接の書き込みは一切許可しない。作成・償還・失効はすべて
-- 下記の SECURITY DEFINER 関数経由のみに限定する（060 と同じ方針）。
-- ----------------------------------------------------------------
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites: 発行者本人と管理者のみ閲覧可" ON public.invites
    FOR SELECT USING (
        auth.uid() = created_by
        OR public.is_current_user_admin()
    );

-- invite_redemptions はクライアントから一切参照不可（RPC 内部でのみ使用）。

-- ----------------------------------------------------------------
-- create_invite: 招待コードを発行する。
-- 管理者は無制限、一般メンバーは max_uses・有効期限・同時発行数を
-- 本関数側でクランプして乱用を防ぐ。
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invite(
    p_max_uses integer DEFAULT 1,
    p_expires_at timestamptz DEFAULT NULL
)
RETURNS text AS $$
DECLARE
    current_user_id uuid := auth.uid();
    caller_is_admin boolean;
    normalized_max_uses integer := GREATEST(1, COALESCE(p_max_uses, 1));
    normalized_expires_at timestamptz := p_expires_at;
    active_invite_count integer;
    generated_code text;
    attempt integer := 0;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    caller_is_admin := public.is_current_user_admin();

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

-- SECURITY DEFINER 関数はデフォルトで PUBLIC に EXECUTE が付与されるため明示的に剥奪する
REVOKE ALL ON FUNCTION public.create_invite(integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invite(integer, timestamptz) TO authenticated;

-- ----------------------------------------------------------------
-- check_invite_code: 消費せずにコードの有効性だけを確認する（STABLE）。
-- 招待リンクを踏んだ直後のプリフィル・未ログイン状態での事前確認用に
-- anon にも実行を許可する。
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_invite_code(p_code text)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.invites i
         WHERE i.code = upper(trim(p_code))
           AND i.revoked_at IS NULL
           AND i.use_count < i.max_uses
           AND (i.expires_at IS NULL OR i.expires_at > now())
    );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

GRANT EXECUTE ON FUNCTION public.check_invite_code(text) TO anon, authenticated;

-- ----------------------------------------------------------------
-- redeem_invite: 招待コードを消費し、許可を記録する。
-- 呼び出し元（サーバー側）はこの成功後に app_metadata.beta_member を
-- service role で付与する。エラーは DETAIL で種別を返し、呼び出し側で
-- 文言を出し分けられるようにする（099 の ANIME_EXCHANGE_* と同じ方式）。
-- 同一ユーザーが既に許可済みなら冪等に成功扱いとする。
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
RETURNS void AS $$
DECLARE
    current_user_id uuid := auth.uid();
    normalized_code text := upper(trim(p_code));
    target_invite public.invites%ROWTYPE;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    IF EXISTS (SELECT 1 FROM public.invite_redemptions r WHERE r.user_id = current_user_id) THEN
        RETURN;
    END IF;

    IF normalized_code = '' THEN
        RAISE EXCEPTION 'invite invalid' USING DETAIL = 'INVITE_INVALID';
    END IF;

    SELECT *
      INTO target_invite
      FROM public.invites i
     WHERE i.code = normalized_code
     FOR UPDATE;

    IF NOT FOUND OR target_invite.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'invite invalid' USING DETAIL = 'INVITE_INVALID';
    END IF;

    IF target_invite.expires_at IS NOT NULL AND target_invite.expires_at <= now() THEN
        RAISE EXCEPTION 'invite expired' USING DETAIL = 'INVITE_EXPIRED';
    END IF;

    IF target_invite.use_count >= target_invite.max_uses THEN
        RAISE EXCEPTION 'invite exhausted' USING DETAIL = 'INVITE_EXHAUSTED';
    END IF;

    -- 同時多重リクエスト対策：並行トランザクションが先に償還を挿入していた場合は
    -- unique_violation で失敗させず冪等に成功扱いとし、use_count も増やさない。
    INSERT INTO public.invite_redemptions (invite_id, user_id)
    VALUES (target_invite.id, current_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    UPDATE public.invites
       SET use_count = use_count + 1
     WHERE id = target_invite.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;

-- ----------------------------------------------------------------
-- revoke_invite: 発行者本人または管理者が招待を失効させる。
-- ----------------------------------------------------------------
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

    IF target_invite.created_by <> current_user_id AND NOT public.is_current_user_admin() THEN
        RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;

    UPDATE public.invites SET revoked_at = now() WHERE id = p_invite_id AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;
