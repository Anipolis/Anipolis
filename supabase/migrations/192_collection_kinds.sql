-- ============================================================
-- 192_collection_kinds: コレクションの種類（リスト・ランキング・ティア表）
-- ============================================================
-- 179 のコレクションは並び順だけを持つ。順位を見せるランキングと、段（S・A・B…）に分けるティア表を足す。
--
-- 方針:
--   * user_collections.kind で種類を持つ（list・ranking・tier）。あとから変えられる。
--   * ランキングは今の並び順がそのまま順位になるので、列は増やさない。
--   * ティア表の段は user_collections.tiers（段の名前の配列。1〜10段、名前は1〜10文字）。
--     作品の段は user_collection_items.tier（tiers の何番目か。0 始まり。NULL は未分類）。
--     段を減らしたら、無くなった段の作品は未分類に戻す。
--   * 並びは今までどおり set_collection_items() で丸ごと置き換える。段も一緒に渡せるようにし、
--     渡さないとき（作品ページから1つ足す・外すなど）は、残る作品の段をそのまま引き継ぐ。
--     引数を足した関数に置き換えるが、2つの引数で呼ぶ今のアプリもそのまま動く。

CREATE OR REPLACE FUNCTION public.collection_tiers_valid(p_tiers text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT cardinality(p_tiers) BETWEEN 1 AND 10
        AND NOT EXISTS (
            SELECT 1 FROM unnest(p_tiers) AS label
            WHERE label IS NULL OR char_length(btrim(label)) NOT BETWEEN 1 AND 10
        );
$$;

ALTER TABLE public.user_collections
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'list',
    ADD COLUMN IF NOT EXISTS tiers text[] NOT NULL DEFAULT ARRAY['S', 'A', 'B', 'C', 'D'];

ALTER TABLE public.user_collections
    DROP CONSTRAINT IF EXISTS user_collections_kind_check,
    ADD CONSTRAINT user_collections_kind_check CHECK (kind IN ('list', 'ranking', 'tier')),
    DROP CONSTRAINT IF EXISTS user_collections_tiers_check,
    ADD CONSTRAINT user_collections_tiers_check CHECK (public.collection_tiers_valid(tiers));

ALTER TABLE public.user_collection_items
    ADD COLUMN IF NOT EXISTS tier smallint;

ALTER TABLE public.user_collection_items
    DROP CONSTRAINT IF EXISTS user_collection_items_tier_range,
    ADD CONSTRAINT user_collection_items_tier_range CHECK (tier IS NULL OR tier BETWEEN 0 AND 9);

GRANT UPDATE (kind, tiers) ON public.user_collections TO authenticated;

-- 段を減らしたら、無くなった段の作品を未分類に戻す。作品の行は利用者が直接更新できない（UPDATE を渡していない）
-- ので、関数の持ち主の権限で動かす。触るのは、本人が更新できた（RLS を通った）コレクションの作品だけ
CREATE OR REPLACE FUNCTION public.reset_removed_collection_tiers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF cardinality(NEW.tiers) < cardinality(OLD.tiers) THEN
        UPDATE public.user_collection_items
        SET tier = NULL
        WHERE collection_id = NEW.id AND tier >= cardinality(NEW.tiers);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_removed_collection_tiers() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_collections_reset_removed_tiers ON public.user_collections;
CREATE TRIGGER user_collections_reset_removed_tiers
    AFTER UPDATE OF tiers ON public.user_collections
    FOR EACH ROW EXECUTE FUNCTION public.reset_removed_collection_tiers();

-- 並びの置き換え（179）に段を足す。p_tiers は p_anime_ids と同じ長さで、各要素は段の番号か NULL（未分類）。
-- p_tiers を渡さないときは、残る作品の今の段を引き継ぐ（新しく入る作品は未分類）
DROP FUNCTION IF EXISTS public.set_collection_items(uuid, bigint[]);
CREATE OR REPLACE FUNCTION public.set_collection_items(
    p_collection_id uuid,
    p_anime_ids bigint[],
    p_tiers smallint[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    ids bigint[] := COALESCE(p_anime_ids, ARRAY[]::bigint[]);
    tier_count integer;
    readable_count integer;
    previous_ids bigint[];
    previous_tiers smallint[];
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;
    -- 自分のコレクションか（他人のものは、見えていても「無い」と同じに扱う）。同時の保存は順番にする
    SELECT cardinality(c.tiers) INTO tier_count
    FROM public.user_collections c
    WHERE c.id = p_collection_id AND c.user_id = current_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'collection not found' USING ERRCODE = 'P0002';
    END IF;
    IF cardinality(ids) > 100 THEN
        RAISE EXCEPTION 'too many items' USING ERRCODE = '22023';
    END IF;
    IF array_position(ids, NULL) IS NOT NULL
        OR (SELECT count(DISTINCT id) FROM unnest(ids) AS id) <> cardinality(ids) THEN
        RAISE EXCEPTION 'invalid items' USING ERRCODE = '22023';
    END IF;
    IF p_tiers IS NOT NULL AND (
        cardinality(p_tiers) <> cardinality(ids)
        OR EXISTS (SELECT 1 FROM unnest(p_tiers) AS t WHERE t IS NOT NULL AND (t < 0 OR t >= tier_count))
    ) THEN
        RAISE EXCEPTION 'invalid tiers' USING ERRCODE = '22023';
    END IF;

    -- 呼んだ人が読める作品だけを入れられる（anime の RLS が非公開・情報未整備の作品を隠す）
    SELECT count(*) INTO readable_count FROM public.anime WHERE id = ANY (ids);
    IF readable_count <> cardinality(ids) THEN
        RAISE EXCEPTION 'anime not found' USING ERRCODE = '22023';
    END IF;

    -- 入れ直す前の段を控える（p_tiers を渡さないときに引き継ぐ）
    SELECT array_agg(anime_id), array_agg(tier) INTO previous_ids, previous_tiers
    FROM public.user_collection_items WHERE collection_id = p_collection_id;

    DELETE FROM public.user_collection_items WHERE collection_id = p_collection_id;
    INSERT INTO public.user_collection_items (collection_id, anime_id, position, tier)
    SELECT
        p_collection_id,
        picked.id,
        (picked.ord - 1)::smallint,
        CASE
            WHEN p_tiers IS NULL THEN previous_tiers[array_position(previous_ids, picked.id)]
            ELSE p_tiers[picked.ord]
        END
    FROM unnest(ids) WITH ORDINALITY AS picked(id, ord);

    UPDATE public.user_collections SET updated_at = now() WHERE id = p_collection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_collection_items(uuid, bigint[], smallint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_collection_items(uuid, bigint[], smallint[]) TO authenticated;

-- 段の名前・並び・数を変える（編集画面）。p_origins は p_tiers と同じ長さで、各段が元は何番目の段だったか
-- （新しく足した段は NULL）。作品の段を新しい番号へ付け替え、消した段の作品は未分類にする。
-- 途中の段を消したとき、後ろの段の作品が1つ上の段へずれないようにするため、同じトランザクションで行う
GRANT UPDATE (tier) ON public.user_collection_items TO authenticated;

DROP POLICY IF EXISTS "user_collection_items: 自分のコレクションの段のみ更新可能" ON public.user_collection_items;
CREATE POLICY "user_collection_items: 自分のコレクションの段のみ更新可能"
    ON public.user_collection_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_collections c
            WHERE c.id = collection_id AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_collections c
            WHERE c.id = collection_id AND c.user_id = auth.uid()
        )
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(auth.uid())
    );

CREATE OR REPLACE FUNCTION public.set_collection_tiers(
    p_collection_id uuid,
    p_tiers text[],
    p_origins smallint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    old_count integer;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;
    SELECT cardinality(c.tiers) INTO old_count
    FROM public.user_collections c
    WHERE c.id = p_collection_id AND c.user_id = current_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'collection not found' USING ERRCODE = 'P0002';
    END IF;
    IF p_tiers IS NULL OR p_origins IS NULL OR cardinality(p_origins) <> cardinality(p_tiers)
        OR EXISTS (SELECT 1 FROM unnest(p_origins) AS o WHERE o IS NOT NULL AND (o < 0 OR o >= old_count))
        OR (SELECT count(o) FROM unnest(p_origins) AS o) <> (SELECT count(DISTINCT o) FROM unnest(p_origins) AS o)
    THEN
        RAISE EXCEPTION 'invalid tiers' USING ERRCODE = '22023';
    END IF;

    -- 元の段の番号 → 新しい番号（見つからない = 消した段は NULL）
    UPDATE public.user_collection_items
    SET tier = (array_position(p_origins, tier) - 1)::smallint
    WHERE collection_id = p_collection_id AND tier IS NOT NULL;

    UPDATE public.user_collections SET tiers = p_tiers, updated_at = now() WHERE id = p_collection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_collection_tiers(uuid, text[], smallint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_collection_tiers(uuid, text[], smallint[]) TO authenticated;
