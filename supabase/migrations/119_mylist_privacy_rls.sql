-- 非公開マイリストを RLS で保護する（Codex監査 P1-2）。
--
-- これまで user_anime_list の SELECT ポリシーは無条件 true で、UI 側の
-- profiles.list_is_public 検査だけが頼りだった。Supabase REST を直接叩けば
-- 非公開ユーザーの視聴状態・評価・進捗を取得できたため、
-- 「本人 OR（対象プロフィールを閲覧可能 AND リスト公開中）」に変更する。
--
-- ランキングビュー（anime_popularity / anime_trending / anime_top_rated）は
-- 101 で security_invoker = true になっているため、このポリシーが集計にも効く。
-- 非公開リストや、閲覧できない鍵アカウントのリストは登録数・スコアに含まれず、
-- 集計値は閲覧者ごとに変わりうる。
-- （当初「security_invoker なしの通常ビューなので非公開リストも集計に含まれる」と
--   書いていたが誤り。2026-10-05 に本番の pg_class.reloptions で確認して訂正）

DROP POLICY IF EXISTS "user_anime_list: 誰でも読める" ON public.user_anime_list;
CREATE POLICY "user_anime_list: 本人または公開リストのみ読める"
    ON public.user_anime_list FOR SELECT
    USING (
        auth.uid() = user_id
        OR (
            public.can_view_profile_content(user_id)
            AND EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = user_id
                  AND p.list_is_public = true
            )
        )
    );
