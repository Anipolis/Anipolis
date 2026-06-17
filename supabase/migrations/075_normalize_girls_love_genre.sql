-- Keep the Girls Love display label aligned with the Jikan importer.

UPDATE public.anime AS anime
SET genre = normalized.genre
FROM (
	SELECT
		id,
		array_agg(genre_value ORDER BY first_ordinal) AS genre
	FROM (
		SELECT
			id,
			CASE WHEN genre_value = '百合' THEN 'ガールズラブ' ELSE genre_value END AS genre_value,
			min(ordinality) AS first_ordinal
		FROM public.anime
		CROSS JOIN LATERAL unnest(genre) WITH ORDINALITY AS current_genre(genre_value, ordinality)
		WHERE '百合' = ANY(genre)
		GROUP BY id, CASE WHEN genre_value = '百合' THEN 'ガールズラブ' ELSE genre_value END
	) deduped
	GROUP BY id
) normalized
WHERE anime.id = normalized.id;
