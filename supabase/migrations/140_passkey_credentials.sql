-- パスキー（WebAuthn）の資格情報。
-- 登録・ログインの検証はアプリサーバー（SimpleWebAuthn）が行い、検証を通ったものだけを
-- service role で書き込む。利用者自身には閲覧と削除だけを許す。
-- INSERT / UPDATE を許すと、検証を通していない公開鍵を PostgREST から直接登録したり
-- 署名カウンタを巻き戻したりできてしまうため。

CREATE TABLE IF NOT EXISTS public.passkey_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- WebAuthn の credential ID（base64url）
    credential_id text NOT NULL UNIQUE,
    -- COSE 形式の公開鍵（base64url）
    public_key text NOT NULL,
    counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
    transports text[] NOT NULL DEFAULT '{}',
    -- 認証器の種類（AAGUID）。表示名の推定に使う
    aaguid text,
    -- singleDevice: その端末だけ / multiDevice: iCloud キーチェーン等で同期される
    device_type text NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
    backed_up boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS passkey_credentials_user_id_idx
    ON public.passkey_credentials (user_id, created_at);

ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.passkey_credentials FROM anon, authenticated;
GRANT SELECT, DELETE ON public.passkey_credentials TO authenticated;

DROP POLICY IF EXISTS "passkey credentials: owners can read" ON public.passkey_credentials;
CREATE POLICY "passkey credentials: owners can read"
    ON public.passkey_credentials
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "passkey credentials: owners can delete" ON public.passkey_credentials;
CREATE POLICY "passkey credentials: owners can delete"
    ON public.passkey_credentials
    FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.passkey_credentials IS
    'WebAuthn passkey credentials. Written only by the app server (service role) after verification.';
