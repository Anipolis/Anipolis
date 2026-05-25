-- Restore query-path indexes lost when user_anime_list was rebuilt in migration 017.
CREATE INDEX IF NOT EXISTS user_anime_list_user_updated_idx
  ON public.user_anime_list (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_anime_list_user_status_updated_idx
  ON public.user_anime_list (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS user_anime_list_anime_updated_idx
  ON public.user_anime_list (anime_id, updated_at DESC);

-- Support notification feed ordering and the unread badge query independently.
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id)
  WHERE read = false;
