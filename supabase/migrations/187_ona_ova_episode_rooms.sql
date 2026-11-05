-- 2話以上の ONA / OVA を話数ルームの対象にする。
-- これまでは放送情報が無いと総合ロビーにしていたが、配信作品にも話数ごとの感想の場所を用意する。
-- 1話15分以下の短編は TV と同じく総合ロビーのまま（scripts/resolve-anime-catalog.ts と同じ決まり）。
-- 管理者が手で決めた作品（room_type_source = 'manual'）は変えない。

UPDATE public.anime a
   SET room_type = 'episode',
       room_type_source = 'auto'
 WHERE a.type IN ('ONA', 'OVA')
   AND a.room_type = 'global'
   AND a.room_type_source IS DISTINCT FROM 'manual'
   AND a.episode_total >= 2
   AND NOT EXISTS (
       SELECT 1
         FROM public.anime_source_records rec
        WHERE rec.mal_id = a.mal_id
          AND rec.source = 'mal'
          AND jsonb_typeof(rec.normalized_data -> 'episode_duration_minutes') = 'number'
          AND (rec.normalized_data ->> 'episode_duration_minutes')::numeric > 0
          AND (rec.normalized_data ->> 'episode_duration_minutes')::numeric <= 15
   );
