-- ============================================================
-- 172_room_experiment_visits_server_only: ルーム実験の訪問記録はサーバーだけが書く（#239）
-- ============================================================
-- 訪問の記録（入室・heartbeat・退出）は /api/room-experiment-visits が service role で書いている
-- （run・作品・ルーム・時刻はサーバーが決める）。しかし本人による直接 INSERT のポリシー
-- （room_experiment_visits_insert_own、090）が残っていて、Supabase の REST API を直接呼べば
-- run_id・entered_at・last_seen_at・heartbeat_count などを好きに入れた訪問を作れ、滞在時間・訪問数の集計を偽れた。
--
--   * 直接 INSERT のポリシーを外し、anon / authenticated の INSERT・UPDATE・DELETE の権限も外す
--     （UPDATE・DELETE のポリシーは元から無いが、権限も残さない）
--   * 読み取り（本人と管理者、room_experiment_visits_select_own_or_admin）はそのまま。
--     退出アンケートの INSERT ポリシー（本人の訪問があること）がこの読み取りに頼っているため
--   * 訪問記録を書き換える DB 関数は無い（validate_room_experiment_visit は検証のトリガーだけ。2026-10-21 確認）

DROP POLICY IF EXISTS "room_experiment_visits_insert_own" ON public.room_experiment_visits;

REVOKE INSERT, UPDATE, DELETE ON public.room_experiment_visits FROM anon, authenticated;
