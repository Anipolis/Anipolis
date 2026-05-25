-- Notify private account owners when a follow request is created.

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('like', 'repost', 'reply', 'mention', 'follow', 'follow_request', 'anime_recommendation'));

CREATE OR REPLACE FUNCTION public.notify_on_follow_request()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
    VALUES (NEW.target_id, NEW.requester_id, 'follow_request', NULL);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_follow_request_notify
    ON public.follow_requests;

CREATE TRIGGER on_follow_request_notify
    AFTER INSERT ON public.follow_requests
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow_request();
