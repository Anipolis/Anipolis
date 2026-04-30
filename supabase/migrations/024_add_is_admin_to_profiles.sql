-- Add is_admin flag to profiles table.
-- Defaults to false so no existing user gains elevated privileges.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
