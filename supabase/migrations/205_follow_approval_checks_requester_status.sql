-- ================================================================
-- 205_follow_approval_checks_requester_status.sql
-- フォロー申請の承認で、申請者の停止・期限内の利用制限を確かめる（#379）
--
-- follows_insert_active_users（195）は is_profile_active_for_writes(follower_id) を見ている。
-- 承認の枝では follower_id は申請者（他人）で、この関数は呼び出し元の権限で account_moderation を読む（039）。
-- account_moderation の SELECT は本人と管理者だけなので、承認する人からは申請者の行が見えず、
-- COALESCE(..., true) で「有効」になって素通りしていた（#315 と同じ種類の問題）。
--
-- 承認の枝にだけ、SECURITY DEFINER で真偽値を返す関数の検査を足す。
--   * 自分宛ての保留中の申請がある相手についてだけ答える。申請が無ければ false（その相手の状態は分からない）
--   * 返すのは真偽値だけ。理由・期限・担当者などは返さない（146 の is_profile_banned と同じ方針）
--   * 判定は is_profile_active_for_writes と同じ（停止は不可、制限は期限切れなら可、行が無ければ可）
-- 申請は消さない。期限付きの制限が明ければ、そのまま承認できる。
-- フォローする側の枝・ほかの条件は 195 のまま。
-- ================================================================

CREATE OR REPLACE FUNCTION public.is_pending_follow_requester_active(requester uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1
            FROM public.follow_requests fr
            WHERE fr.requester_id = requester
              AND fr.target_id = auth.uid()
              AND fr.status = 'pending'
        )
        AND COALESCE(
            (
                SELECT
                    am.status = 'active'
                    OR (
                        am.status = 'restricted'
                        AND am.restricted_until IS NOT NULL
                        AND am.restricted_until <= now()
                    )
                FROM public.account_moderation am
                WHERE am.user_id = requester
            ),
            true
        );
$$;

REVOKE ALL ON FUNCTION public.is_pending_follow_requester_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pending_follow_requester_active(uuid) TO authenticated, service_role;

-- INSERT のポリシーは permissive で OR になるので、195 と同じくすべて外してから作り直す
DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN
        SELECT polname
        FROM pg_policy
        WHERE polrelid = 'public.follows'::regclass
          AND polcmd = 'a'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.follows', policy_name);
    END LOOP;
END $$;

CREATE POLICY "follows_insert_active_users"
    ON public.follows FOR INSERT
    WITH CHECK (
        (
            (
                auth.uid() = follower_id
                AND EXISTS (
                    SELECT 1
                    FROM public.profiles target
                    WHERE target.id = following_id
                      AND target.is_private = false
                )
            )
            OR (
                auth.uid() = following_id
                AND EXISTS (
                    SELECT 1
                    FROM public.follow_requests fr
                    WHERE fr.requester_id = follower_id
                      AND fr.target_id = following_id
                      AND fr.status = 'pending'
                )
                AND public.is_pending_follow_requester_active(follower_id)
            )
        )
        AND public.is_profile_active_for_writes(follower_id)
        AND public.has_beta_write_access()
        AND NOT public.is_blocked_between(follower_id, following_id)
    );
