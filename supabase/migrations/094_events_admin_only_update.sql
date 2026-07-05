-- イベントの更新権限を管理者のみに統一する。
-- イベント作成自体が管理者限定(067_events_admin_only_insert.sql)のため、
-- 091 で導入した「作成者 または 管理者」の作成者分岐は実質デッドコードであり、
-- 管理者権限を失った元作成者が編集し続けられる穴にもなるため撤去する。

DROP POLICY IF EXISTS "作成者または管理者はイベントを更新可" ON public.events;
DROP POLICY IF EXISTS "管理者はイベントを更新可" ON public.events;
CREATE POLICY "管理者はイベントを更新可" ON public.events
    FOR UPDATE TO authenticated
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
