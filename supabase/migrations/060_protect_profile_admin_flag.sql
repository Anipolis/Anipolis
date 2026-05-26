-- Keep admin assignment out of user-controlled profile writes.
-- Trusted SQL Editor and service-role operations can still manage admins.

CREATE OR REPLACE FUNCTION public.prevent_untrusted_profile_admin_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF COALESCE(auth.role(), '') IN ('anon', 'authenticated')
       AND (
           (TG_OP = 'INSERT' AND NEW.is_admin = true)
           OR (TG_OP = 'UPDATE' AND OLD.is_admin IS DISTINCT FROM NEW.is_admin)
       ) THEN
        RAISE EXCEPTION 'profiles.is_admin may only be changed by trusted administrative operations'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_is_admin ON public.profiles;
CREATE TRIGGER profiles_protect_is_admin
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_untrusted_profile_admin_changes();
