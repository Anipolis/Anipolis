-- Restrict event creation to platform administrators.

DROP POLICY IF EXISTS "認証ユーザーはイベントを作成可" ON public.events;

CREATE POLICY "管理者はイベントを作成可" ON public.events
    FOR INSERT TO authenticated
    WITH CHECK (
        creator_id = auth.uid()
        AND public.is_current_user_admin()
    );
