-- 非公開マイリストを RLS で保護する（Codex監査 P1-2）。
--
-- これまで user_anime_list の SELECT ポリシーは無条件 true で、UI 側の
-- profiles.list_is_public 検査だけが頼りだった。Supabase REST を直接叩けば
-- 非公開ユーザーの視聴状態・評価・進捗を取得できたため、
-- 「本人 OR（対象プロフィールを閲覧可能 AND リスト公開中）」に変更する。
--
-- ランキングビュー（anime_popularity / anime_trending / anime_top_rated）は
-- security_invoker を指定していない通常ビュー＝ビュー所有者（postgres）の
-- 権限で実行され RLS の影響を受けないため、非公開リストも含む集計は
-- 従来どおり動作する（行レベル情報は返さないので安全）。

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
