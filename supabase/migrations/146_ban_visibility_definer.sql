-- ============================================================
-- 146_ban_visibility_definer: BAN したアカウントの投稿を第三者から隠す判定を直す（#315）
-- ============================================================
-- can_view_profile_content() は呼び出し元の権限で account_moderation を読んでいた。
-- account_moderation の SELECT は本人と管理者だけ（039）なので、第三者や未ログインからは
-- BAN の行が見えず、COALESCE(..., true) で「有効なアカウント」扱いに戻っていた。
-- その結果、公開アカウントを BAN しても、投稿・リポスト・マイリスト等が第三者から見え続けた。
--
-- BAN かどうかだけを返す SECURITY DEFINER の関数で判定する。
--   * 返すのは真偽値だけ。理由・期限・担当者などの非公開情報は返さない。
--   * BAN されたアカウントは投稿が見えなくなるので、真偽値自体は外から推測できる情報と変わらない。
--   * 141 と同じく search_path を固定し、PUBLIC からは実行権限を外して明示的に付ける。

CREATE OR REPLACE FUNCTION public.is_profile_banned(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.account_moderation am
        WHERE am.user_id = profile_id
          AND am.status = 'banned'
    );
$$;

REVOKE ALL ON FUNCTION public.is_profile_banned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_banned(uuid) TO anon, authenticated, service_role;

-- 141 の定義のうち、BAN の判定だけを is_profile_banned() に置き換える
-- （鍵アカウント・フォロワー・管理者・ブロックの条件はそのまま）
CREATE OR REPLACE FUNCTION public.can_view_profile_content(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        (
            NOT public.is_profile_banned(profile_id)
            OR public.is_current_user_admin()
            OR profile_id = auth.uid()
        )
        AND (
            profile_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = profile_id
                  AND p.is_private = false
            )
            OR EXISTS (
                SELECT 1
                FROM public.follows f
                WHERE f.follower_id = auth.uid()
                  AND f.following_id = profile_id
            )
            OR public.is_current_user_admin()
        )
        -- ブロックは管理者権限でも上書きしない（管理操作は admin 画面の経路で行う）
        AND NOT public.is_blocked_between(auth.uid(), profile_id);
$$;
