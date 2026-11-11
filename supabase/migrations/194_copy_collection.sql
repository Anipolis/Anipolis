-- ================================================================
-- 194_copy_collection.sql
-- 他の人のコレクションを取り込む（自分のコレクションとして写す）。
--
-- 写すのは題名・種類・段・作品・並び順・段の振り分け。写したあとは元とつながらず、自由に直せる。
-- 写したものは非公開で始め、説明に「〇〇さんのコレクションから取り込みました」と入れる。
-- 呼んだ人の権限で読むので、見られないコレクション（非公開・鍵の相手）は取り込めず、
-- 呼んだ人が読めない作品（非公開・情報未整備）は写さない。1人20コレクションまでの制限もそのまま効く。
-- ================================================================

CREATE OR REPLACE FUNCTION public.copy_collection(p_source_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    source public.user_collections%ROWTYPE;
    owner_name text;
    new_id uuid;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;

    SELECT * INTO source FROM public.user_collections WHERE id = p_source_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'collection not found' USING ERRCODE = 'P0002';
    END IF;
    -- 自分のコレクションは取り込まない（画面にも出さない）
    IF source.user_id = current_user_id THEN
        RAISE EXCEPTION 'own collection' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.username) INTO owner_name
    FROM public.profiles p WHERE p.id = source.user_id;

    INSERT INTO public.user_collections (user_id, title, description, is_public, kind, tiers)
    VALUES (
        current_user_id,
        source.title,
        left(COALESCE(owner_name, '別の人') || 'さんのコレクションから取り込みました', 300),
        false,
        source.kind,
        source.tiers
    )
    RETURNING id INTO new_id;

    -- 読めない作品を飛ばしたぶん、並び順は 0 から詰め直す
    INSERT INTO public.user_collection_items (collection_id, anime_id, position, tier)
    SELECT new_id, picked.anime_id, (picked.ord - 1)::smallint, picked.tier
    FROM (
        SELECT i.anime_id, i.tier, row_number() OVER (ORDER BY i.position) AS ord
        FROM public.user_collection_items i
        JOIN public.anime a ON a.id = i.anime_id
        WHERE i.collection_id = p_source_id
    ) AS picked;

    RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_collection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_collection(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
