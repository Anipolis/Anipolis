-- anime.genre のタグ表記を、取り込みと絞り込みの語彙(src/lib/anime-vocabulary.ts)に揃える。
-- 1. MAL に後から増えたテーマ 2 件は取り込み時の訳が無く、英語のまま保存されていた。
-- 2. 誤解を招く訳を見直した(オカルト → 超常現象 など)。対応は LEGACY_GENRE_JA と同じ。
-- 同じ作品に旧表記と新表記が両方ある場合は 1 つにまとめ、最初に出てきた位置を保つ。

WITH label_map(old_label, new_label) AS (
	VALUES
		('Urban Fantasy', '現代ファンタジー'),
		('Love Status Quo', 'もどかしい恋'),
		('百合', 'ガールズラブ'),
		('オカルト', '超常現象'),
		('アバンギャルド', '前衛・実験的'),
		('エロティカ', '性描写'),
		('大人キャスト', '大人が主役'),
		('ショービズ', '芸能界'),
		('心理', '心理描写'),
		('頭脳戦', '頭脳ゲーム'),
		('恋愛群像', '多角関係'),
		('ビジュアルアーツ', '美術'),
		('日常系', '美少女日常'),
		('侍', '武士'),
		('芸能', '舞台芸術')
),
normalized AS (
	SELECT id, array_agg(genre_value ORDER BY first_ordinal) AS genre
	FROM (
		SELECT
			anime.id,
			coalesce(label_map.new_label, current_genre.genre_value) AS genre_value,
			min(current_genre.ordinality) AS first_ordinal
		FROM public.anime
		CROSS JOIN LATERAL unnest(anime.genre) WITH ORDINALITY AS current_genre(genre_value, ordinality)
		LEFT JOIN label_map ON label_map.old_label = current_genre.genre_value
		WHERE anime.genre && ARRAY(SELECT old_label FROM label_map)
		GROUP BY anime.id, coalesce(label_map.new_label, current_genre.genre_value)
	) deduped
	GROUP BY id
)
UPDATE public.anime
SET genre = normalized.genre
FROM normalized
WHERE anime.id = normalized.id;
