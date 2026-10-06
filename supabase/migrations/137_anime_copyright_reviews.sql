-- 権利表記（©）の人力確認キュー。取り込みスクリプト（collect:copyright /
-- import:annict）が自動で決められなかった作品を積み、管理画面の「©確認」で
-- 管理者が採用する表記を決める。
--   collector_multiple: 公式サイトから複数の © 候補が取れた
--   annict_mismatch:    Annict の © が既存の © と食い違う
--   annict_shared:      Annict の © を、別作品と同じ表記のまま入れた（続編が1期の
--                       © のままになっていないかの確認用）
--   annict_ambiguous:   同じ MAL ID の複数の Annict 作品で © が食い違う
-- 書き込みは取り込みスクリプト（service role）と管理者のみ。

CREATE TABLE IF NOT EXISTS public.anime_copyright_reviews (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    anime_id bigint NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    kind text NOT NULL
        CHECK (kind IN ('collector_multiple', 'annict_mismatch', 'annict_shared', 'annict_ambiguous')),
    -- [{ "text": "©…", "source": "official_site" | "annict" }]
    candidates jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidates) = 'array'),
    note text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    -- kept: 現在の © のまま / replaced: 候補または手入力に置換 / cleared: © なしに確定
    resolution text CHECK (resolution IN ('kept', 'replaced', 'cleared')),
    resolved_copyright text,
    resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (anime_id, kind),
    CHECK ((status = 'pending') = (resolution IS NULL))
);

CREATE INDEX IF NOT EXISTS anime_copyright_reviews_pending_idx
    ON public.anime_copyright_reviews (kind, id)
    WHERE status = 'pending';

ALTER TABLE public.anime_copyright_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anime copyright reviews: admins can read" ON public.anime_copyright_reviews;
CREATE POLICY "anime copyright reviews: admins can read"
    ON public.anime_copyright_reviews
    FOR SELECT
    USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "anime copyright reviews: admins can resolve" ON public.anime_copyright_reviews;
CREATE POLICY "anime copyright reviews: admins can resolve"
    ON public.anime_copyright_reviews
    FOR UPDATE
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());

COMMENT ON TABLE public.anime_copyright_reviews IS
    'Admin review queue for anime copyright notices that importers could not decide automatically.';
