-- ================================================================
-- 195_follows_insert_requires_public_target.sql
-- 鍵アカウントへのフォローは、相手の承認（follow_requests）を通ったときだけ作れるようにする。
--
-- これまでの follows_insert_active_users は「自分がフォローする側なら作れる」とだけ見ていて、
-- 相手が鍵アカウントかどうかはアプリ（toggleFollowAction）だけが確かめていた。
-- can_view_profile_content は follows の行があればフォロワーとして扱うので、
-- フォローする側の枝に「相手が公開アカウントであること」を足す。
-- 承認の枝（相手本人が、保留中の申請に対して作る）と、そのほかの条件は 141 のまま。
--
-- INSERT のポリシーは permissive で、複数あると OR になる。別のポリシーが残っていると
-- 条件を足しても効かないので、039 と同じく follows の INSERT ポリシーをすべて外してから作り直す。
-- ================================================================

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
            )
        )
        AND public.is_profile_active_for_writes(follower_id)
        AND public.has_beta_write_access()
        AND NOT public.is_blocked_between(follower_id, following_id)
    );
