-- 放送スケジュール列をanimeテーブルに追加
-- broadcast_day: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土 (JST)
-- broadcast_time: 放送開始時刻表記 (JST)。深夜アニメ表記の 26:00 なども許可
-- broadcast_station: 放送局名の配列

ALTER TABLE anime
  ADD COLUMN broadcast_day     smallint CHECK (broadcast_day BETWEEN 0 AND 6),
  ADD COLUMN broadcast_time    text CHECK (
    broadcast_time IS NULL OR broadcast_time ~ '^([01]?[0-9]|2[0-6]):[0-5][0-9]$'
  ),
  ADD COLUMN broadcast_station text[];
