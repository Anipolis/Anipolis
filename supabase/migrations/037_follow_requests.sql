-- Private account follow requests.
CREATE TABLE public.follow_requests (
    requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending')),
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (requester_id, target_id),
    CONSTRAINT no_self_follow_request CHECK (requester_id != target_id)
);

CREATE INDEX follow_requests_target_pending_idx
    ON public.follow_requests (target_id, created_at DESC)
    WHERE status = 'pending';

CREATE INDEX follow_requests_requester_idx
    ON public.follow_requests (requester_id, created_at DESC);

ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_requests_select_participants" ON public.follow_requests
    FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = target_id);

CREATE POLICY "follow_requests_insert_own" ON public.follow_requests
    FOR INSERT WITH CHECK (
        auth.uid() = requester_id
        AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = target_id
              AND p.is_private = true
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.follows f
            WHERE f.follower_id = requester_id
              AND f.following_id = target_id
        )
    );

CREATE POLICY "follow_requests_delete_participants" ON public.follow_requests
    FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = target_id);

CREATE POLICY "follows_insert_by_approved_request" ON public.follows
    FOR INSERT WITH CHECK (
        auth.uid() = following_id
        AND EXISTS (
            SELECT 1
            FROM public.follow_requests fr
            WHERE fr.requester_id = follower_id
              AND fr.target_id = following_id
              AND fr.status = 'pending'
        )
    );
