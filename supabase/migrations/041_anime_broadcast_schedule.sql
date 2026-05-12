-- 放送スケジュール列をanimeテーブルに追加
-- broadcast_day: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土 (JST)
-- broadcast_time: 放送開始時刻 (JST)
-- broadcast_station: 放送局名の配列

ALTER TABLE anime
  ADD COLUMN broadcast_day     smallint CHECK (broadcast_day BETWEEN 0 AND 6),
  ADD COLUMN broadcast_time    time,
  ADD COLUMN broadcast_station text[];
