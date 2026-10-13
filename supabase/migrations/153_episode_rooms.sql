-- ============================================================
-- 153_episode_rooms: 話数ルームの土台（実況ルームの話数単位化・第二弾）
-- ============================================================
-- 実況ルームを「作品×放送日・約65分」から「作品×話数・投稿期限なし」に変える。
-- 設計: Claude Docs「実況ルームの話数単位化 設計たたき台」（2026-10-13）
--
--   * episode_rooms（新規）: 作品×話数（kind = episode）と特番（kind = special）のルーム
--   * broadcast_room_sessions: 今の放送日ごとのルームを「放送枠」として残し、話数ルームに紐づける
--   * posts.episode_room_id: 投稿の行き先。放送枠の時間内の投稿は、今どおり放送枠の id も持つ
--
-- 今の本番アプリ（master）と互換にする。
--   * 今のアプリは放送枠（broadcast_room_session_id）だけを指定して投稿する。その投稿にはトリガーが
--     話数ルームを補う。放送時間の制限（061 の posts_enforce_broadcast_room_window）はそのまま
--   * 話数ルームを直接指定する投稿（新しいアプリ）は、ルームが開いていれば時間外でも受け付ける。
--     放送枠の時間内なら、その放送枠の id をトリガーが補う
--   * 既存の列・関数・ビューは変えない（列の追加とトリガーの追加だけ）
--
-- 話数ルームを開くとき（opens_at）:
--   * 放送枠があれば、その話の放送枠のうち最も早い posting_opens_at
--   * 放送枠のない過去作・配信作品は ensure_episode_room() が作品の情報から決める
--   * opens_at が NULL または未来のルームには投稿できない（まだ放送していない話）

-- ----------------------------------------------------------------
-- 1) episode_rooms
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.episode_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    anime_id integer NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('episode', 'special')),
    episode_number integer CHECK (episode_number IS NULL OR episode_number >= 1),
    special_key text,
    label text,
    opens_at timestamptz,
    -- 管理者が opens_at を設定したルームは、放送枠の追加で上書きしない（週1配信の ONA など）
    opens_at_locked boolean NOT NULL DEFAULT false,
    merged_into uuid REFERENCES public.episode_rooms(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT episode_rooms_kind_shape CHECK (
        (kind = 'episode' AND episode_number IS NOT NULL AND special_key IS NULL)
        OR (
            kind = 'special'
            AND episode_number IS NULL
            AND special_key IS NOT NULL AND btrim(special_key) <> ''
            AND label IS NOT NULL AND btrim(label) <> ''
        )
    ),
    CONSTRAINT episode_rooms_not_merged_into_self CHECK (merged_into IS NULL OR merged_into <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS episode_rooms_episode_unique
    ON public.episode_rooms (anime_id, episode_number)
    WHERE kind = 'episode';

CREATE UNIQUE INDEX IF NOT EXISTS episode_rooms_special_unique
    ON public.episode_rooms (anime_id, special_key)
    WHERE kind = 'special';

ALTER TABLE public.episode_rooms ENABLE ROW LEVEL SECURITY;

-- 放送枠（broadcast_room_sessions）と同じく誰でも読める。書き込みは下の関数と service role だけ。
DROP POLICY IF EXISTS "episode_rooms: visible to all" ON public.episode_rooms;
CREATE POLICY "episode_rooms: visible to all"
    ON public.episode_rooms
    FOR SELECT
    USING (true);

COMMENT ON TABLE public.episode_rooms IS
    'Per-episode (and special) rooms. Posts go here; broadcast_room_sessions are airings within a room.';

-- ----------------------------------------------------------------
-- 2) 放送枠と投稿の列
-- ----------------------------------------------------------------
ALTER TABLE public.broadcast_room_sessions
    ADD COLUMN IF NOT EXISTS episode_room_id uuid REFERENCES public.episode_rooms(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS airing_kind text NOT NULL DEFAULT 'first'
        CHECK (airing_kind IN ('first', 'rerun', 'event')),
    -- 話数をまたぐイベント（一挙放送・上映会）の子の放送枠。イベントルームはこれでつなぐ（後の PR）
    ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS broadcast_room_sessions_episode_room_idx
    ON public.broadcast_room_sessions (episode_room_id, posting_opens_at)
    WHERE episode_room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS broadcast_room_sessions_event_idx
    ON public.broadcast_room_sessions (event_id, scheduled_at)
    WHERE event_id IS NOT NULL;

ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS episode_room_id uuid REFERENCES public.episode_rooms(id) ON DELETE SET NULL;

-- ルームの時系列表示（前後へのページ送り）用
CREATE INDEX IF NOT EXISTS posts_episode_room_created_idx
    ON public.posts (episode_room_id, created_at, id)
    WHERE episode_room_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 3) 放送枠 → 話数ルーム
-- ----------------------------------------------------------------
-- 話数ルームを取得し、無ければ作る（内部用。資格の判定はしない）
CREATE OR REPLACE FUNCTION public.upsert_episode_room_for_airing(
    p_anime_id integer,
    p_episode_number integer,
    p_opens_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    room_id uuid;
BEGIN
    INSERT INTO public.episode_rooms (anime_id, kind, episode_number, opens_at)
    VALUES (p_anime_id, 'episode', p_episode_number, p_opens_at)
    ON CONFLICT (anime_id, episode_number) WHERE kind = 'episode'
    DO UPDATE SET opens_at = CASE
        WHEN episode_rooms.opens_at_locked THEN episode_rooms.opens_at
        ELSE LEAST(COALESCE(episode_rooms.opens_at, EXCLUDED.opens_at), EXCLUDED.opens_at)
    END
    RETURNING id INTO room_id;
    RETURN room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_episode_room_for_airing(integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_episode_room_for_airing(integer, integer, timestamptz) TO service_role;

-- 話数のある放送枠に、話数ルームを割り当てる。話数の訂正（131）で話数が変われば付け替える
CREATE OR REPLACE FUNCTION public.assign_broadcast_room_session_episode_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.room_kind = 'episode' AND NEW.episode_number IS NOT NULL THEN
        NEW.episode_room_id := public.upsert_episode_room_for_airing(
            NEW.anime_id, NEW.episode_number, NEW.posting_opens_at
        );
    ELSIF TG_OP = 'INSERT' OR NEW.episode_number IS DISTINCT FROM OLD.episode_number THEN
        -- 話数が外れた放送枠はルームから外す（投稿は放送日の URL から引き続き見られる）
        NEW.episode_room_id := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_room_sessions_assign_episode_room ON public.broadcast_room_sessions;
CREATE TRIGGER broadcast_room_sessions_assign_episode_room
    BEFORE INSERT OR UPDATE OF episode_number, room_kind, anime_id, posting_opens_at
    ON public.broadcast_room_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.assign_broadcast_room_session_episode_room();

-- 放送枠のルームが変わったら、その放送枠の時間内の投稿も一緒に移す
CREATE OR REPLACE FUNCTION public.move_broadcast_room_session_posts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.posts
       SET episode_room_id = NEW.episode_room_id
     WHERE broadcast_room_session_id = NEW.id
       AND episode_room_id IS DISTINCT FROM NEW.episode_room_id;
    RETURN NEW;
END;
$$;

-- 列指定（UPDATE OF episode_room_id）にすると、話数の訂正で BEFORE トリガーが episode_room_id を
-- 変えた場合に動かない（UPDATE OF は SET に書かれた列だけを見る）。値の変化で判定する。
DROP TRIGGER IF EXISTS broadcast_room_sessions_move_posts ON public.broadcast_room_sessions;
CREATE TRIGGER broadcast_room_sessions_move_posts
    AFTER UPDATE ON public.broadcast_room_sessions
    FOR EACH ROW
    WHEN (OLD.episode_room_id IS DISTINCT FROM NEW.episode_room_id)
    EXECUTE FUNCTION public.move_broadcast_room_session_posts();

-- ----------------------------------------------------------------
-- 4) 投稿 → 話数ルーム
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_post_episode_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    session_room_id uuid;
    target_room public.episode_rooms%ROWTYPE;
    live_session_id uuid;
BEGIN
    -- 放送枠を指定した投稿（今のアプリ）: 放送枠の話数ルームを補う
    IF NEW.broadcast_room_session_id IS NOT NULL THEN
        SELECT episode_room_id INTO session_room_id
          FROM public.broadcast_room_sessions
         WHERE id = NEW.broadcast_room_session_id;

        IF NEW.episode_room_id IS NULL THEN
            NEW.episode_room_id := session_room_id;
        ELSIF session_room_id IS NOT NULL AND NEW.episode_room_id <> session_room_id THEN
            RAISE EXCEPTION 'Post room does not match its broadcast room session'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.episode_room_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 話数ルームを直接指定した投稿（新しいアプリ）
    SELECT * INTO target_room FROM public.episode_rooms WHERE id = NEW.episode_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid episode room for post' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.anime_id IS NULL THEN
        NEW.anime_id := target_room.anime_id;
    ELSIF NEW.anime_id <> target_room.anime_id THEN
        RAISE EXCEPTION 'Invalid episode room for post' USING ERRCODE = 'check_violation';
    END IF;

    -- 新しい投稿だけ、ルームが開いているかを確かめる（管理者の付け替えなどの UPDATE は対象外）
    IF TG_OP = 'INSERT' THEN
        IF target_room.merged_into IS NOT NULL
           OR target_room.opens_at IS NULL
           OR target_room.opens_at > clock_timestamp() THEN
            RAISE EXCEPTION 'Episode room is not accepting posts' USING ERRCODE = 'check_violation';
        END IF;

        -- 放送枠の時間内なら、その放送枠の投稿としても記録する（画面の見出し・話数の訂正で使う）
        SELECT id INTO live_session_id
          FROM public.broadcast_room_sessions
         WHERE episode_room_id = NEW.episode_room_id
           AND posting_opens_at <= clock_timestamp()
           AND posting_closes_at >= clock_timestamp()
         ORDER BY posting_opens_at DESC
         LIMIT 1;
        NEW.broadcast_room_session_id := live_session_id;
    END IF;

    RETURN NEW;
END;
$$;

-- 名前の順で 061 の posts_enforce_broadcast_room_window より先に動く（a < e）。
-- ここで補った放送枠は時間内のものなので、061 の時間の検査も通る。
DROP TRIGGER IF EXISTS posts_assign_episode_room ON public.posts;
CREATE TRIGGER posts_assign_episode_room
    BEFORE INSERT OR UPDATE OF episode_room_id, broadcast_room_session_id, anime_id ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.assign_post_episode_room();

-- ----------------------------------------------------------------
-- 5) 放送枠のない話数ルームを開く
-- ----------------------------------------------------------------
-- 話数ルームを返す。無ければ、作品の情報から開いてよいかを判断して作る。開けなければ NULL。
--   * 話数のある作品だけ: TV、または ONA / OVA で2話以上。映画・特番（Special）は対象外
--   * 放送枠がある作品: その作品の放送枠の最大話数までは放送済みとして開く。それより先は開かない
--   * 放送枠がない作品: 放送が終わった作品（status = finished）か、配信開始日を過ぎた ONA / OVA。
--     話数（episode_total）が分かっていて、その範囲内の話だけ
CREATE OR REPLACE FUNCTION public.ensure_episode_room(p_anime_id integer, p_episode_number integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    room public.episode_rooms%ROWTYPE;
    target_anime public.anime%ROWTYPE;
    max_aired_episode integer;
    opens timestamptz;
    today_jst date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
    IF p_anime_id IS NULL OR p_episode_number IS NULL OR p_episode_number < 1 THEN
        RETURN NULL;
    END IF;

    SELECT * INTO room
      FROM public.episode_rooms
     WHERE anime_id = p_anime_id AND kind = 'episode' AND episode_number = p_episode_number;
    IF FOUND THEN
        RETURN room.id;
    END IF;

    SELECT * INTO target_anime FROM public.anime WHERE id = p_anime_id;
    IF NOT FOUND
       OR target_anime.room_type = 'global'
       OR NOT (
           target_anime.type = 'TV'
           OR (target_anime.type IN ('ONA', 'OVA') AND COALESCE(target_anime.episode_total, 0) >= 2)
       )
       OR (target_anime.episode_total IS NOT NULL AND p_episode_number > target_anime.episode_total) THEN
        RETURN NULL;
    END IF;

    SELECT max(episode_number) INTO max_aired_episode
      FROM public.broadcast_room_sessions
     WHERE anime_id = p_anime_id
       AND room_kind = 'episode'
       AND episode_number IS NOT NULL
       AND posting_opens_at <= now();

    IF max_aired_episode IS NOT NULL THEN
        IF p_episode_number > max_aired_episode THEN
            RETURN NULL;
        END IF;
        opens := now();
    ELSIF target_anime.episode_total IS NULL THEN
        RETURN NULL;
    ELSIF target_anime.status = 'finished' THEN
        opens := now();
    ELSIF target_anime.type IN ('ONA', 'OVA')
          AND target_anime.aired_from IS NOT NULL
          AND target_anime.aired_from <= today_jst THEN
        -- 配信作品は配信開始日に全話を開く
        opens := LEAST(now(), (target_anime.aired_from::timestamp AT TIME ZONE 'Asia/Tokyo'));
    ELSE
        RETURN NULL;
    END IF;

    INSERT INTO public.episode_rooms (anime_id, kind, episode_number, opens_at)
    VALUES (p_anime_id, 'episode', p_episode_number, opens)
    ON CONFLICT (anime_id, episode_number) WHERE kind = 'episode' DO NOTHING
    RETURNING * INTO room;

    IF room.id IS NULL THEN
        SELECT * INTO room
          FROM public.episode_rooms
         WHERE anime_id = p_anime_id AND kind = 'episode' AND episode_number = p_episode_number;
    END IF;
    RETURN room.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_episode_room(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_episode_room(integer, integer) TO authenticated, service_role;

-- ----------------------------------------------------------------
-- 6) 既存データの移し替え
-- ----------------------------------------------------------------
-- 話数のある放送枠に話数ルームを割り当てる（トリガーを UPDATE OF episode_number で動かす）。
-- 凍結済みの放送枠も episode_number を同じ値で更新するだけなので、104 / 131 の保護には触れない。
UPDATE public.broadcast_room_sessions
   SET episode_number = episode_number
 WHERE room_kind = 'episode'
   AND episode_number IS NOT NULL
   AND episode_room_id IS NULL;

-- 放送枠の時間内の投稿に話数ルームを補う（上の UPDATE の AFTER トリガーでも移るが、取りこぼしの確認として）
UPDATE public.posts post
   SET episode_room_id = session.episode_room_id
  FROM public.broadcast_room_sessions session
 WHERE post.broadcast_room_session_id = session.id
   AND session.episode_room_id IS NOT NULL
   AND post.episode_room_id IS DISTINCT FROM session.episode_room_id;
