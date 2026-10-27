-- ============================================================
-- 178_favorite_anime: プロフィールの「ベスト作品」（#361 のお気に入り）
-- ============================================================
-- プロフィールに好きな作品を並べて見せる場所が無かった。マイリストは5つの視聴ステータスで
-- 分けるだけなので、「この人はどんな作品が好きか」を伝えられない。
--
-- 方針:
--   * マイリスト（user_anime_list）とは別の表にする。マイリストに入れていない作品も選べる。
--   * 1人10件まで。position 0〜9 と (user_id, position) の一意で DB 側でも上限を守る。
--   * 見える人は投稿と同じ（can_view_profile_content: 鍵アカウント・ブロック・BAN）。
--     マイリストの公開設定（list_is_public）とは別。プロフィールに飾るものなので、
--     マイリストを非公開にしていても見せられる。
--   * プロフィールに出る（他人に見える）書き込みなので、130 の方針どおり
--     β権限とアカウント状態の両方を要求する。
--   * 保存は set_favorite_anime() で一覧ごと置き換える（並べ替え・追加・削除を1回で）。
--     SECURITY INVOKER なので RLS がそのまま効く。作品が読めるか（非公開・情報未整備の作品を
--     選ばせない）も、呼んだ人の権限で anime を読んで確かめる。

CREATE TABLE IF NOT EXISTS public.user_favorite_anime (
    user_id    uuid     NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    anime_id   bigint   NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    position   smallint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, anime_id),
    CONSTRAINT user_favorite_anime_position_range CHECK (position BETWEEN 0 AND 9),
    CONSTRAINT user_favorite_anime_position_unique UNIQUE (user_id, position)
);

CREATE INDEX IF NOT EXISTS user_favorite_anime_anime_id_idx ON public.user_favorite_anime (anime_id);

ALTER TABLE public.user_favorite_anime ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_favorite_anime: 投稿と同じ相手に見せる" ON public.user_favorite_anime;
CREATE POLICY "user_favorite_anime: 投稿と同じ相手に見せる"
    ON public.user_favorite_anime FOR SELECT
    USING (
        auth.uid() = user_id
        OR public.can_view_profile_content(user_id)
    );

DROP POLICY IF EXISTS "user_favorite_anime: 自分のみ追加可能" ON public.user_favorite_anime;
CREATE POLICY "user_favorite_anime: 自分のみ追加可能"
    ON public.user_favorite_anime FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.has_beta_write_access()
        AND public.is_profile_active_for_writes(user_id)
    );

DROP POLICY IF EXISTS "user_favorite_anime: 自分のみ削除可能" ON public.user_favorite_anime;
CREATE POLICY "user_favorite_anime: 自分のみ削除可能"
    ON public.user_favorite_anime FOR DELETE
    USING (
        auth.uid() = user_id
        AND public.has_beta_write_access()
    );

-- UPDATE は使わない（set_favorite_anime が消して入れ直す）ので、ポリシーも権限も与えない
REVOKE ALL ON public.user_favorite_anime FROM anon, authenticated;
GRANT SELECT ON public.user_favorite_anime TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_favorite_anime TO authenticated;

-- ベスト作品を、渡した順番で丸ごと置き換える。空の配列なら全部外す
CREATE OR REPLACE FUNCTION public.set_favorite_anime(p_anime_ids bigint[])
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
    IF cardinality(ids) > 10 THEN
        RAISE EXCEPTION 'too many favorites' USING ERRCODE = '22023';
    END IF;
    IF array_position(ids, NULL) IS NOT NULL
        OR (SELECT count(DISTINCT id) FROM unnest(ids) AS id) <> cardinality(ids) THEN
        RAISE EXCEPTION 'invalid favorites' USING ERRCODE = '22023';
    END IF;

    -- 呼んだ人が読める作品だけを選べる（anime の RLS が非公開・情報未整備の作品を隠す）
    SELECT count(*) INTO readable_count FROM public.anime WHERE id = ANY (ids);
    IF readable_count <> cardinality(ids) THEN
        RAISE EXCEPTION 'anime not found' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.user_favorite_anime WHERE user_id = current_user_id;
    INSERT INTO public.user_favorite_anime (user_id, anime_id, position)
    SELECT current_user_id, picked.id, (picked.ord - 1)::smallint
    FROM unnest(ids) WITH ORDINALITY AS picked(id, ord);
END;
$$;

REVOKE ALL ON FUNCTION public.set_favorite_anime(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_favorite_anime(bigint[]) TO authenticated;
