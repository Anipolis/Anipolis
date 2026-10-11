-- ============================================================
-- 142_account_deletion: 退会（アカウント削除）の下準備（#117）
-- ============================================================
-- 退会は Auth Admin API で auth.users の行を消す。profiles.id は
-- auth.users(id) ON DELETE CASCADE なので、投稿・いいね・通知・マイリスト等は
-- 連鎖削除される。ここでは連鎖を妨げるものと、運用に必要な記録だけを整える。
--
-- 1) room_experiment_runs.created_by は ON DELETE RESTRICT・NOT NULL だったため、
--    ルーム実験を作成したアカウントの削除が DB レベルで止まっていた。
--    実験の計測データ（visits / survey responses）は run に紐づいて残したいので、
--    run を消すのではなく作成者を NULL にできるようにする。
--    created_by = auth.uid() を使う 088 のポリシーは NULL では false になるため、
--    作成者が消えた run は管理者のみが扱える状態になる（意図どおり）。
--
-- 2) 退会の件数・傾向を把握するための記録。個人を識別できる値は保存しない。
--    （ban 回避の追跡にはメール等の保持が必要になるが、プライバシーとの
--      トレードオフになるため、ここでは踏み込まない。別途判断する）

ALTER TABLE public.room_experiment_runs
    ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.room_experiment_runs
    DROP CONSTRAINT IF EXISTS room_experiment_runs_created_by_fkey;

ALTER TABLE public.room_experiment_runs
    ADD CONSTRAINT room_experiment_runs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- 退会の記録（個人を識別しない集計用）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_deletions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deleted_at timestamptz NOT NULL DEFAULT now(),
    -- 退会時点のアカウント状態（active / restricted / banned）。
    -- 制限中の退会が多いかどうかを運用で見るためだけに持つ。
    moderation_status text NOT NULL DEFAULT 'active'
        CHECK (moderation_status IN ('active', 'restricted', 'banned')),
    -- 退会時点の投稿数。削除規模の把握用。
    post_count integer NOT NULL DEFAULT 0 CHECK (post_count >= 0),
    -- 'self'（本人の退会）のみを想定。管理者削除を作る場合に 'admin' を使う。
    initiated_by text NOT NULL DEFAULT 'self'
        CHECK (initiated_by IN ('self', 'admin'))
);

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

-- 書き込みは service role（退会処理）だけ。anon / authenticated には何も許可しない。
DROP POLICY IF EXISTS "account_deletions_select_admin" ON public.account_deletions;
CREATE POLICY "account_deletions_select_admin"
    ON public.account_deletions FOR SELECT
    USING (public.is_current_user_admin());

COMMENT ON TABLE public.account_deletions IS
    'Aggregate-only record of account deletions. Holds no identifying information by design.';
