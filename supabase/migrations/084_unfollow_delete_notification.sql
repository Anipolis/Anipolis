-- フォロー解除時に対応する follow 通知を自動削除し、通知の重複を防ぐ
-- (follow→unfollow→follow の往復連打で通知が積み増される問題への対策)
CREATE OR REPLACE FUNCTION public.handle_unfollow_delete_notification()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.notifications
    WHERE type = 'follow'
      AND actor_id = OLD.follower_id       -- フォローしていた人（行為者）
      AND recipient_id = OLD.following_id;  -- フォローされていた人（受信者）
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_follow_deleted
    AFTER DELETE ON public.follows
    FOR EACH ROW EXECUTE FUNCTION public.handle_unfollow_delete_notification();
