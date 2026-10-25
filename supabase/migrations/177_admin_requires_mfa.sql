-- ============================================================
-- 177_admin_requires_mfa: 管理者の権限は二段階認証を済ませたログイン（aal2）のときだけ使える
-- ============================================================
-- 管理者のパスワード（や Discord などのアカウント）が盗まれても、Supabase の API を直接呼んで
-- 管理者の権限（作品・投稿の書き換え、通報や監査ログの閲覧など）を使えないようにする。
--
--   1. is_current_user_admin(): 管理者で、かつ今のログインが二段階認証済み（JWT の aal が aal2）のときだけ true。
--      管理者の判定はほぼすべてこの関数を通っている（RLS・Storage のポリシー、SECURITY DEFINER の関数）
--   2. reports・admin_audit_logs のポリシーは profiles.is_admin を直接見ていたので、この関数に置き換える。
--      条件はそれ以外そのまま（2026-10-25 に本番の定義を確認して写した）
--
-- 適用の順番: 二段階認証を設定する画面が本番に出て、管理者が設定を済ませてから適用する。
-- 先に適用すると、設定を済ませるまで管理者の権限が DB で使えなくなる（一般の利用者としては使える）。
-- service role（auth.uid() が無い）は、これまでどおり関数では管理者扱いされない。

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_admin = true
       );
$$;

DROP POLICY IF EXISTS admin_audit_logs_insert_admin ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_insert_admin ON public.admin_audit_logs
    FOR INSERT
    WITH CHECK (auth.uid() = admin_id AND public.is_current_user_admin());

DROP POLICY IF EXISTS admin_audit_logs_select_admin ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_select_admin ON public.admin_audit_logs
    FOR SELECT
    USING (public.is_current_user_admin());

DROP POLICY IF EXISTS reports_select_own_or_admin ON public.reports;
CREATE POLICY reports_select_own_or_admin ON public.reports
    FOR SELECT
    USING (auth.uid() = reporter_id OR public.is_current_user_admin());

DROP POLICY IF EXISTS reports_update_admin ON public.reports;
CREATE POLICY reports_update_admin ON public.reports
    FOR UPDATE
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
