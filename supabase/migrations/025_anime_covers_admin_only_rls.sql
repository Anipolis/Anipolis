-- Restrict anime-covers bucket write access to admin users only.
-- Replaces the overly-permissive "all authenticated" policies from 020_anime_covers_storage.sql.

DROP POLICY IF EXISTS "authenticated users can upload anime covers"  ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can update anime covers"  ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can delete anime covers"  ON storage.objects;

CREATE POLICY "admins can upload anime covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'anime-covers'
    AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    )
);

CREATE POLICY "admins can update anime covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'anime-covers'
    AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    )
);

CREATE POLICY "admins can delete anime covers"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'anime-covers'
    AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    )
);
