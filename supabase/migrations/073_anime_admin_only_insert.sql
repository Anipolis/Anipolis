-- Restrict anime creation to platform administrators.

DROP POLICY IF EXISTS "anime: admin can insert" ON public.anime;
CREATE POLICY "anime: admin can insert"
    ON public.anime FOR INSERT
    TO authenticated
    WITH CHECK (public.is_current_user_admin());
