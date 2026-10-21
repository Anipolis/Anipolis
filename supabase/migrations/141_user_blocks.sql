-- ============================================================
-- 141_user_blocks: ブロック機能（#360）
-- ============================================================
-- ミュート（自分に見えなくする）と鍵アカウント（見せる相手を選ぶ）はあるが、
-- 「特定の相手に自分を見せない・関わらせない」手段が無かった。実況ルームは
-- 同じ時間に同じ場所へ集まるため、相手を避けられないと逃げ場が無い。
--
-- 方針:
--   * 判定は is_blocked_between() に集約し、can_view_profile_content() に差し込む。
--     これで posts / reposts / user_anime_list の SELECT、likes / reposts の INSERT、
--     get_post_counts、get_post_reaction_users、get_following_timeline(SECURITY INVOKER)
--     がまとめてブロックを尊重する。
--   * 片方向のブロックでも双方向に効かせる（ブロックした側の画面からも相手が消える）。
--     どちらが先に遮断したかを相手に推測させないため、および嫌がらせの往復を防ぐため。
--   * can_view_profile_content を通らない経路（投稿の返信・引用先、フォロー、
--     ブックマーク、メンション通知、マイリスト通知、反応ユーザー一覧）は個別に追加する。
--   * user_blocks は本人にしか影響しない設定なので、130 の方針どおりβガードのみ。
--     制限中・停止中でも自分を守る操作はできる方が安全。

CREATE TABLE IF NOT EXISTS public.user_blocks (
    blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT user_blocks_no_self_block CHECK (blocker_id <> blocked_id)
);

-- 「自分をブロックしている相手」を引くための逆引き
CREATE INDEX IF NOT EXISTS user_blocks_blocked_id_idx ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- 自分が作ったブロックだけを読める。相手にはブロックされた事実を見せない。
DROP POLICY IF EXISTS "user_blocks_select_own" ON public.user_blocks;
CREATE POLICY "user_blocks_select_own"
    ON public.user_blocks FOR SELECT
    USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "user_blocks_insert_own" ON public.user_blocks;
CREATE POLICY "user_blocks_insert_own"
    ON public.user_blocks FOR INSERT
    WITH CHECK (
        auth.uid() = blocker_id
        AND public.has_beta_write_access()
    );

DROP POLICY IF EXISTS "user_blocks_delete_own" ON public.user_blocks;
CREATE POLICY "user_blocks_delete_own"
    ON public.user_blocks FOR DELETE
    USING (auth.uid() = blocker_id);

-- ----------------------------------------------------------------
-- 判定関数
-- ----------------------------------------------------------------
-- user_blocks の SELECT は本人の行だけなので、呼び出し元の権限で読む関数では
-- 「自分がブロックされている」側を判定できない。そのため SECURITY DEFINER にする。
-- 引数は viewer / target の順だが、判定は双方向であることに注意。
CREATE OR REPLACE FUNCTION public.is_blocked_between(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN user_a IS NULL OR user_b IS NULL OR user_a = user_b THEN false
        ELSE EXISTS (
            SELECT 1
            FROM public.user_blocks b
            WHERE (b.blocker_id = user_a AND b.blocked_id = user_b)
               OR (b.blocker_id = user_b AND b.blocked_id = user_a)
        )
    END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO anon, authenticated, service_role;

-- アプリ側の一覧フィルター用。自分が関わるブロックの相手を両方向まとめて返す。
-- 「自分をブロックしている相手」は user_blocks の SELECT ポリシーでは読めないため、
-- ここで SECURITY DEFINER にして auth.uid() の分だけを返す（引数を取らない）。
CREATE OR REPLACE FUNCTION public.get_blocked_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT b.blocked_id AS user_id
    FROM public.user_blocks b
    WHERE b.blocker_id = auth.uid()
    UNION
    SELECT b.blocker_id AS user_id
    FROM public.user_blocks b
    WHERE b.blocked_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_blocked_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_blocked_user_ids() TO authenticated, service_role;

-- ----------------------------------------------------------------
-- can_view_profile_content にブロックを追加（039 の定義 + ブロック検査）
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_profile_content(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        (
            COALESCE(
                (
                    SELECT am.status != 'banned'
                    FROM public.account_moderation am
                    WHERE am.user_id = profile_id
                ),
                true
            )
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

-- ----------------------------------------------------------------
-- can_view_profile_content を通らない書き込み経路
-- ----------------------------------------------------------------
-- 返信・引用の相手。118 の posts_insert_active_users + ブロック検査。
DROP POLICY IF EXISTS "posts_insert_active_users" ON public.posts;
CREATE POLICY "posts_insert_active_users"
    ON public.posts FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
        AND NOT EXISTS (
            SELECT 1
            FROM public.posts parent
            WHERE parent.id = parent_id
              AND public.is_blocked_between(auth.uid(), parent.user_id)
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.posts quoted
            WHERE quoted.id = quoted_post_id
              AND public.is_blocked_between(auth.uid(), quoted.user_id)
        )
    );

-- フォロー。118 の follows_insert_active_users + ブロック検査。
DROP POLICY IF EXISTS "follows_insert_active_users" ON public.follows;
CREATE POLICY "follows_insert_active_users"
    ON public.follows FOR INSERT
    WITH CHECK (
        (
            auth.uid() = follower_id
            OR (
                auth.uid() = following_id
                AND EXISTS (
                    SELECT 1
                    FROM public.follow_requests fr
                    WHERE fr.requester_id = follower_id
                      AND fr.target_id = following_id
                      AND fr.status = 'pending'
                )
            )
        )
        AND public.is_profile_active_for_writes(follower_id)
        AND public.has_beta_write_access()
        AND NOT public.is_blocked_between(follower_id, following_id)
    );

-- フォロー申請。118 の follow_requests_insert_active_users + ブロック検査。
DROP POLICY IF EXISTS "follow_requests_insert_active_users" ON public.follow_requests;
CREATE POLICY "follow_requests_insert_active_users" ON public.follow_requests
    FOR INSERT WITH CHECK (
        auth.uid() = requester_id
        AND public.is_profile_active_for_writes(requester_id)
        AND public.has_beta_write_access()
        AND NOT public.is_blocked_between(requester_id, target_id)
        AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = target_id
              AND p.is_private = true
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.follows f
            WHERE f.follower_id = requester_id
              AND f.following_id = target_id
        )
    );

-- ブックマーク。118 の bookmarks_insert_active_users + ブロック検査。
-- （118 の時点では投稿の可視性検査が無かったため、ここで投稿者のブロックだけ足す）
DROP POLICY IF EXISTS "bookmarks_insert_active_users" ON public.bookmarks;
CREATE POLICY "bookmarks_insert_active_users" ON public.bookmarks
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND public.is_profile_active_for_writes(user_id)
        AND public.has_beta_write_access()
        AND NOT EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = post_id
              AND public.is_blocked_between(auth.uid(), p.user_id)
        )
    );

-- ----------------------------------------------------------------
-- ブロック時に既存の関係を解除する
-- ----------------------------------------------------------------
-- フォロー・フォロー申請は、INSERT を止めるだけでは既存の関係が残る。
-- アプリ側の実装漏れに依存しないよう、行の追加と同じトランザクションで解除する。
CREATE OR REPLACE FUNCTION public.sever_relationship_on_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.follows
    WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
       OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);

    DELETE FROM public.follow_requests
    WHERE (requester_id = NEW.blocker_id AND target_id = NEW.blocked_id)
       OR (requester_id = NEW.blocked_id AND target_id = NEW.blocker_id);

    -- 相手に起因する未読通知も残さない（既読は履歴として残す）
    DELETE FROM public.notifications
    WHERE NOT read
      AND (
            (recipient_id = NEW.blocker_id AND actor_id = NEW.blocked_id)
         OR (recipient_id = NEW.blocked_id AND actor_id = NEW.blocker_id)
      );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_block_sever_relationship ON public.user_blocks;
CREATE TRIGGER on_user_block_sever_relationship
    AFTER INSERT ON public.user_blocks
    FOR EACH ROW EXECUTE FUNCTION public.sever_relationship_on_block();

-- ----------------------------------------------------------------
-- 通知トリガー: 行の INSERT が RLS で止まらない経路だけ個別に対応
-- ----------------------------------------------------------------
-- メンションは投稿本文から拾うため、相手の投稿を見られなくても通知が飛ぶ。
-- 026 の定義 + ブロック検査。
CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS TRIGGER AS $$
DECLARE
    mentioned_username TEXT;
    mentioned_user_id  UUID;
BEGIN
    FOR mentioned_username IN
        SELECT DISTINCT (regexp_matches(NEW.content, '@([A-Za-z0-9_]+)', 'g'))[1]
    LOOP
        SELECT id INTO mentioned_user_id
        FROM public.profiles
        WHERE username = mentioned_username;

        -- 存在するユーザーかつ自分自身でなく、ブロック関係が無ければ通知
        IF mentioned_user_id IS NOT NULL
           AND mentioned_user_id != NEW.user_id
           AND NOT public.is_blocked_between(NEW.user_id, mentioned_user_id) THEN
            INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
            VALUES (mentioned_user_id, NEW.user_id, 'mention', NEW.id);
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- マイリストのステータス通知はフォロワー全員へのファンアウトなので、
-- ブロック相手が混ざらないよう除外する。126 の定義 + ブロック検査。
CREATE OR REPLACE FUNCTION public.notify_on_mylist_status()
RETURNS TRIGGER AS $$
DECLARE
    list_public BOOLEAN;
BEGIN
    IF NEW.status NOT IN ('watching', 'completed', 'plan_to_watch') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    SELECT p.list_is_public INTO list_public
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    IF list_public IS DISTINCT FROM TRUE THEN
        RETURN NEW;
    END IF;

    -- Read notifications can be repeated intentionally: once a prior
    -- notification is read, a later status change is meaningful again.
    INSERT INTO public.notifications
        (recipient_id, actor_id, type, mylist_anime_id, mylist_status)
    SELECT f.follower_id, NEW.user_id, 'mylist_status', NEW.anime_id, NEW.status
    FROM public.follows f
    WHERE f.following_id = NEW.user_id
      AND NOT public.is_blocked_between(NEW.user_id, f.follower_id)
    ON CONFLICT (recipient_id, actor_id, mylist_anime_id, mylist_status)
        WHERE type = 'mylist_status' AND NOT read
        DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------
-- 反応ユーザー一覧: 投稿の可視性に加えて、一覧に並ぶ各ユーザーも除外する
-- 126 の定義 + ブロック検査。
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_post_reaction_users(
    target_post_id uuid,
    action_type text,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    user_id uuid,
    username text,
    display_name text,
    avatar_url text,
    reacted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    post_author_id uuid;
    effective_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
    effective_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF action_type IS NULL OR action_type NOT IN ('like', 'repost') THEN
        RAISE EXCEPTION 'invalid reaction type';
    END IF;

    SELECT p.user_id INTO post_author_id
    FROM public.posts p
    WHERE p.id = target_post_id
      AND public.can_view_profile_content(p.user_id)
      AND (NOT p.hidden_by_admin OR public.is_current_user_admin());

    IF post_author_id IS NULL THEN
        RETURN;
    END IF;

    IF action_type = 'like'
       AND (auth.uid() IS NULL OR post_author_id IS DISTINCT FROM auth.uid()) THEN
        RETURN;
    END IF;

    IF action_type = 'like' THEN
        RETURN QUERY
        SELECT l.user_id, p.username, p.display_name, p.avatar_url, l.created_at
        FROM public.likes l
        JOIN public.profiles p ON p.id = l.user_id
        WHERE l.post_id = target_post_id
          AND NOT public.is_blocked_between(auth.uid(), l.user_id)
        ORDER BY l.created_at DESC
        LIMIT effective_limit OFFSET effective_offset;
    ELSE
        RETURN QUERY
        SELECT r.user_id, p.username, p.display_name, p.avatar_url, r.created_at
        FROM public.reposts r
        JOIN public.profiles p ON p.id = r.user_id
        WHERE r.post_id = target_post_id
          AND NOT public.is_blocked_between(auth.uid(), r.user_id)
        ORDER BY r.created_at DESC
        LIMIT effective_limit OFFSET effective_offset;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_post_reaction_users(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_reaction_users(uuid, text, integer, integer) TO anon, authenticated, service_role;
