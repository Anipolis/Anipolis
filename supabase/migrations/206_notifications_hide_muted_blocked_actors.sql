-- ================================================================
-- 206_notifications_hide_muted_blocked_actors.sql
-- ミュート・ブロックした相手からの通知を、DB の側で読めなくする（#558）
--
-- これまではアプリがミュート・ブロック相手の ID を読み、`actor_id.not.in.(...)` を URL に並べて絞っていた。
-- 相手が API の取得上限（max_rows = 1000）を超えると ID の一部しか読めず、読めなかった相手の通知が出ていた。
-- 件数が多いと URL の長さの上限にも当たる。
--
-- notifications の SELECT に RESTRICTIVE のポリシーを足し、既存の「自分宛てだけ」（permissive）と AND で効かせる。
--   * actor_id が NULL のシステム通知（放送・トレード成立など）はそのまま
--   * 自分がミュートした相手（191、片方向）からの通知は読めない
--   * ブロックはどちらの向きでも読めない（141 の is_blocked_between。SECURITY DEFINER で相手からのブロックも見える）
-- ミュート・ブロックを解除すれば、残っている通知はまた読める（これまでのアプリの絞り込みと同じ）。
-- 既読にする UPDATE も SELECT のポリシーを通った行だけが対象になるので、隠れている通知は未読のまま残る。
-- service_role（通知の作成・送信）は RLS を通らないので影響しない。
-- ================================================================

DROP POLICY IF EXISTS "notifications_hide_muted_and_blocked_actors" ON public.notifications;

CREATE POLICY "notifications_hide_muted_and_blocked_actors"
    ON public.notifications
    AS RESTRICTIVE
    FOR SELECT
    TO authenticated
    USING (
        actor_id IS NULL
        OR (
            NOT EXISTS (
                SELECT 1
                FROM public.user_mutes m
                WHERE m.muter_id = (SELECT auth.uid())
                  AND m.muted_id = notifications.actor_id
            )
            AND NOT public.is_blocked_between((SELECT auth.uid()), actor_id)
        )
    );
