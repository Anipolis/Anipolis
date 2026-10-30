-- ============================================================
-- 179_collections: コレクション（#515。ユーザーが作る作品のまとめ）
-- ============================================================
-- マイリストは視聴の記録（5つのステータス）、ベスト作品（178）はプロフィールに飾る10作品。
-- 「2026年の個人的ベスト」「実況が盛り上がる作品」のような、テーマを決めて人に見せるまとめが無かった。
--
-- 方針:
--   * マイリストとは別の表にする（Letterboxd の Lists と同じ考え方）。マイリストに無い作品も入れられ、
--     並び順と説明を自由に持てる。
--   * 1人20コレクション、1コレクション100作品まで。題名は1〜50文字、説明は300文字まで（DB でも守る）。
--   * 公開・非公開をコレクションごとに選ぶ。公開は投稿と同じ相手に見せる（can_view_profile_content:
--     鍵アカウント・ブロック・BAN）。非公開は本人だけ。中の作品は、コレクションが見える人にだけ見える。
--   * 他人に見える書き込みなので、130 の方針どおり作成・更新・作品の追加は β権限とアカウント状態を求める。
--     消すのは β権限だけでよい（制限中でも自分の公開物を下げられる方が安全）。
--   * 作品の並びは set_collection_items() で丸ごと置き換える（178 の set_favorite_anime と同じ形）。

CREATE TABLE IF NOT EXISTS public.user_collections (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title       text NOT NULL,
    description text,
    is_public   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_collections_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 50),
    CONSTRAINT user_collections_description_length CHECK (description IS NULL OR char_length(description) <= 300)
);

CREATE INDEX IF NOT EXISTS user_collections_user_id_idx ON public.user_collections (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_collection_items (
    collection_id uuid     NOT NULL REFERENCES public.user_collections(id) ON DELETE CASCADE,
    anime_id      bigint   NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    position      smallint NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, anime_id),
    CONSTRAINT user_collection_items_position_range CHECK (position BETWEEN 0 AND 99),
    CONSTRAINT user_collection_items_position_unique UNIQUE (collection_id, position)
);

CREATE INDEX IF NOT EXISTS user_collection_items_anime_id_idx ON public.user_collection_items (anime_id);

-- 1人20コレクションまで。同時に作っても超えないよう、本人ごとに直列にしてから数える
CREATE OR REPLACE FUNCTION public.enforce_collection_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('user_collections:' || NEW.user_id::text, 0));
    IF (SELECT count(*) FROM public.user_collections WHERE user_id = NEW.user_id) >= 20 THEN
        RAISE EXCEPTION 'too many collections' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_collections_limit ON public.user_collections;
CREATE TRIGGER user_collections_limit
    BEFORE INSERT ON public.user_collections
    FOR EACH ROW EXECUTE FUNCTION public.enforce_collection_limit();

ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_collection_items ENABLE ROW LEVEL SECURITY;

-- ---------- user_collections ----------
DROP POLICY IF EXISTS "user_collections: 本人と、公開なら投稿と同じ相手に見せる" ON public.user_collections;
CREATE POLICY "user_collections: 本人と、公開なら投稿と同じ相手に見せる"
    ON public.user_collections FOR SELECT
    USING (
        auth.uid() = user_id
        OR (is_public AND public.can_view_profile_content(user_id))
    );

DROP POLICY IF EXISTS "user_collections: 自分のみ作成可能" ON public.user_collections;
CREATE POLICY "user_collections: 自分のみ作成可能"
    ON public.user_collections FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(user_id)
    );

DROP POLICY IF EXISTS "user_collections: 自分のみ更新可能" ON public.user_collections;
CREATE POLICY "user_collections: 自分のみ更新可能"
    ON public.user_collections FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(user_id)
    );

DROP POLICY IF EXISTS "user_collections: 自分のみ削除可能" ON public.user_collections;
CREATE POLICY "user_collections: 自分のみ削除可能"
    ON public.user_collections FOR DELETE
    USING (
        auth.uid() = user_id
        AND public.has_beta_write_access()
    );

-- ---------- user_collection_items ----------
-- 中の作品は、コレクション自体が見える人にだけ見える（下の EXISTS にも user_collections の RLS が効く）
DROP POLICY IF EXISTS "user_collection_items: コレクションが見える人に見せる" ON public.user_collection_items;
CREATE POLICY "user_collection_items: コレクションが見える人に見せる"
    ON public.user_collection_items FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.user_collections c WHERE c.id = collection_id)
    );

DROP POLICY IF EXISTS "user_collection_items: 自分のコレクションにのみ追加可能" ON public.user_collection_items;
CREATE POLICY "user_collection_items: 自分のコレクションにのみ追加可能"
    ON public.user_collection_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_collections c
            WHERE c.id = collection_id AND c.user_id = auth.uid()
        )
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(auth.uid())
    );

DROP POLICY IF EXISTS "user_collection_items: 自分のコレクションからのみ削除可能" ON public.user_collection_items;
CREATE POLICY "user_collection_items: 自分のコレクションからのみ削除可能"
    ON public.user_collection_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_collections c
            WHERE c.id = collection_id AND c.user_id = auth.uid()
        )
        AND public.has_beta_write_access()
    );

-- 作品の UPDATE は使わない（set_collection_items が消して入れ直す）ので、ポリシーも権限も与えない
REVOKE ALL ON public.user_collections FROM anon, authenticated;
REVOKE ALL ON public.user_collection_items FROM anon, authenticated;
GRANT SELECT ON public.user_collections TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_collections TO authenticated;
-- 更新できるのは題名・説明・公開設定だけ（持ち主や作った日時は変えさせない）
GRANT UPDATE (title, description, is_public, updated_at) ON public.user_collections TO authenticated;
GRANT SELECT ON public.user_collection_items TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_collection_items TO authenticated;

-- コレクションの作品を、渡した順番で丸ごと置き換える。空の配列なら全部外す
CREATE OR REPLACE FUNCTION public.set_collection_items(p_collection_id uuid, p_anime_ids bigint[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid := auth.uid();
    ids bigint[] := COALESCE(p_anime_ids, ARRAY[]::bigint[]);
    readable_count integer;
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'login required';
    END IF;
    -- 自分のコレクションか（他人のものは、見えていても「無い」と同じに扱う）。同時の保存は順番にする
    PERFORM 1 FROM public.user_collections
    WHERE id = p_collection_id AND user_id = current_user_id
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

    -- 呼んだ人が読める作品だけを入れられる（anime の RLS が非公開・情報未整備の作品を隠す）
    SELECT count(*) INTO readable_count FROM public.anime WHERE id = ANY (ids);
    IF readable_count <> cardinality(ids) THEN
        RAISE EXCEPTION 'anime not found' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.user_collection_items WHERE collection_id = p_collection_id;
    INSERT INTO public.user_collection_items (collection_id, anime_id, position)
    SELECT p_collection_id, picked.id, (picked.ord - 1)::smallint
    FROM unnest(ids) WITH ORDINALITY AS picked(id, ord);

    UPDATE public.user_collections SET updated_at = now() WHERE id = p_collection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_collection_items(uuid, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_collection_items(uuid, bigint[]) TO authenticated;
