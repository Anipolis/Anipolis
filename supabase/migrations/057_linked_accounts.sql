-- アカウント切り替え機能: 双方向リンクテーブル
-- A→B と B→A の両方を保持することで owner_user_id の等値フィルタだけで自分のリンク一覧を取得できる

CREATE TABLE IF NOT EXISTS public.linked_accounts (
  owner_user_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  linked_user_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_order  smallint    NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, linked_user_id),
  CHECK (owner_user_id <> linked_user_id)
);

CREATE INDEX linked_accounts_owner_idx ON public.linked_accounts (owner_user_id);

ALTER TABLE public.linked_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "linked_accounts: owner select"
  ON public.linked_accounts FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY "linked_accounts: owner delete"
  ON public.linked_accounts FOR DELETE
  USING (auth.uid() = owner_user_id);

-- INSERT は service role のみ（addAccount アクションが service role クライアントを使って双方向 upsert する）

CREATE OR REPLACE FUNCTION public.check_linked_accounts_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- 追加アカウントは最大 2（自分を含め 3 アカウント）
  IF (SELECT COUNT(*) FROM public.linked_accounts
      WHERE owner_user_id = NEW.owner_user_id) >= 2 THEN
    RAISE EXCEPTION 'linked_accounts_limit_exceeded'
      USING DETAIL = 'Maximum 2 additional accounts (3 total) allowed per user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER linked_accounts_limit_trigger
  BEFORE INSERT ON public.linked_accounts
  FOR EACH ROW EXECUTE FUNCTION public.check_linked_accounts_limit();
