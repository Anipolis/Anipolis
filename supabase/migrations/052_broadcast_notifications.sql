-- Per-user anime broadcast notification subscriptions
CREATE TABLE IF NOT EXISTS broadcast_notification_subscriptions (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, anime_id)
);

ALTER TABLE broadcast_notification_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own broadcast subscriptions"
  ON broadcast_notification_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX broadcast_notification_subscriptions_user_id_idx
  ON broadcast_notification_subscriptions(user_id);

-- Per-user broadcast notification timing settings
CREATE TABLE IF NOT EXISTS broadcast_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  notify_1min BOOLEAN NOT NULL DEFAULT TRUE,
  notify_5min BOOLEAN NOT NULL DEFAULT TRUE,
  notify_30min BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broadcast_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own broadcast notification settings"
  ON broadcast_notification_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
