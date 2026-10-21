-- ============================================================
-- 162_profile_username_lowercase_enforced: ID の小文字を DB で守り、メンションも区別せずに照合する
-- ============================================================
-- 161 の Codex レビュー（#409）:
--   * lower(username) の一意のインデックスは大文字の値そのものは許すので、利用者が PostgREST から
--     自分の username を直接 'Alice' に書き換えられる。プロフィールの URL は小文字へ転送されるため、
--     そうなるとプロフィールに届かなくなる。CHECK で小文字だけを許す（アプリ・トリガーは小文字で書く）
--   * notify_on_mention は投稿の表記のまま照合していたので、@Anipolis_info のように大文字で書くと
--     通知が届かなかった。表記を小文字にして lower(username) で照合する（141 の定義 + 小文字化）

-- 2026-10-15 時点で全件小文字（161 で変換済み）
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_username_lowercase CHECK (username = lower(username));

CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS TRIGGER AS $$
DECLARE
    mentioned_username TEXT;
    mentioned_user_id  UUID;
BEGIN
    FOR mentioned_username IN
        -- ID は小文字で保存している（161）。投稿の表記（@Anipolis_info など）は小文字にそろえて照合する
        SELECT DISTINCT lower((regexp_matches(NEW.content, '@([A-Za-z0-9_]+)', 'g'))[1])
    LOOP
        SELECT id INTO mentioned_user_id
        FROM public.profiles
        WHERE lower(username) = mentioned_username;

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
