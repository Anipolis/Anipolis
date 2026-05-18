-- Reports and minimal admin moderation dashboard support.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE public.reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type text NOT NULL CHECK (target_type IN ('post', 'user')),
    target_id uuid NOT NULL,
    target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'sexual', 'violence', 'illegal', 'other')),
    details text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'rejected')),
    resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reports_details_length CHECK (details IS NULL OR char_length(details) <= 500),
    CONSTRAINT reports_no_self_user_report CHECK (
        target_type != 'user' OR reporter_id != target_id
    )
);

CREATE INDEX reports_status_created_at_idx ON public.reports (status, created_at DESC);
CREATE INDEX reports_target_idx ON public.reports (target_type, target_id);
CREATE INDEX reports_reporter_idx ON public.reports (reporter_id, created_at DESC);

CREATE UNIQUE INDEX reports_open_unique_idx
    ON public.reports (reporter_id, target_type, target_id)
    WHERE status IN ('open', 'reviewing');

CREATE TABLE public.admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);
CREATE INDEX admin_audit_logs_admin_idx ON public.admin_audit_logs (admin_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    IF NEW.status IN ('resolved', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.resolved_at = now();
        NEW.resolved_by = auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_touch_updated_at ON public.reports;
CREATE TRIGGER reports_touch_updated_at
    BEFORE UPDATE ON public.reports
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_reports_updated_at();

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_insert_own" ON public.reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "reports_select_own_or_admin" ON public.reports
    FOR SELECT USING (
        auth.uid() = reporter_id
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_admin = true
        )
    );

CREATE POLICY "reports_update_admin" ON public.reports
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_admin = true
        )
    );

CREATE POLICY "admin_audit_logs_insert_admin" ON public.admin_audit_logs
    FOR INSERT WITH CHECK (
        auth.uid() = admin_id
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_admin = true
        )
    );

CREATE POLICY "admin_audit_logs_select_admin" ON public.admin_audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_admin = true
        )
    );
