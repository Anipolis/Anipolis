-- ============================================================
-- 129_drop_post_engagement_counts: 未使用の公開 RPC get_post_engagement_counts を削除
-- ============================================================
-- 053 で追加し 062 で作り直した get_post_engagement_counts(uuid[]) は、入力配列の
-- 件数上限を持たないまま SECURITY DEFINER で anon / authenticated に公開されていた。
-- 任意長の配列で likes / reposts / posts の集計を何度でも走らせられるため、匿名
-- リクエストから DB 負荷を増幅できる（Issue #231）。
--
-- アプリは 121 で上限 200 件付きの get_post_counts に移行済みで、この関数を呼ぶ
-- コードは残っていない。上限を付けて維持するより、公開面そのものを無くす。

DROP FUNCTION IF EXISTS public.get_post_engagement_counts(uuid[]);
