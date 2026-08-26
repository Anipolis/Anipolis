-- 招待システムの2つの穴を塞ぐ（リリースPRレビュー指摘）。
--
-- (1) create_invite が auth.uid() の存在しか要求しないため、公開 signup で
--     作ったメールユーザーが RPC を直接呼んで自己招待でき、クローズドβを
--     迂回できた。発行は管理者または既存βメンバー（JWT の
--     app_metadata.beta_member）に限定する。
--
-- (2) invite_redemptions.user_id が public.profiles(id) を参照していたが、
--     083 は OAuth ユーザーの profile 作成をオンボーディング完了まで遅延する。
--     コールバックはオンボーディング前に redeem_invite を呼ぶため、新規
--     Google / X ユーザーは外部キー違反で償還できずログインを拒否された。
--     償還記録は auth.users(id) に紐付ける。

-- ----------------------------------------------------------------
-- (2) 償還記録の外部キーを auth.users へ付け替え
-- ----------------------------------------------------------------
ALTER TABLE public.invite_redemptions
    DROP CONSTRAINT IF EXISTS invite_redemptions_user_id_fkey;
ALTER TABLE public.invite_redemptions
    ADD CONSTRAINT invite_redemptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- (1) create_invite: 発行者は管理者または既存βメンバーのみ
-- ----------------------------------------------------------------
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
