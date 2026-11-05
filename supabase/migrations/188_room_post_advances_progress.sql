-- 話数ルームへの投稿で、マイリストの進んだ話数を上げる（#357）。
-- マイリストで「視聴中」の作品だけを対象にし、登録や状態の変更はしない。進んだ話数は減らさない。
-- 通算の話数の作品は、シーズンの何話目かに読み替える（第67話からのシーズンの第67話は 1）。
-- 本人の行を本人の権限で更新する（RLS がそのまま効く）。

CREATE OR REPLACE FUNCTION public.advance_mylist_progress_from_room(p_anime_id integer, p_episode_number integer)
RETURNS TABLE (
    previous_progress integer,
    new_progress integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    current_progress integer;
    season_start integer;
    total integer;
    target integer;
BEGIN
    IF auth.uid() IS NULL OR p_anime_id IS NULL OR p_episode_number IS NULL OR p_episode_number < 1 THEN
        RETURN;
    END IF;

    SELECT l.progress INTO current_progress
      FROM public.user_anime_list l
     WHERE l.user_id = auth.uid()
       AND l.anime_id = p_anime_id
       AND l.status = 'watching'
       FOR UPDATE;
    -- 読み替えた話数は元の話数以下なので、ここで止まるなら範囲は計算しない（投稿のたびに走るため）
    IF NOT FOUND OR current_progress >= p_episode_number THEN
        RETURN;
    END IF;

    SELECT b.season_first INTO season_start FROM public.episode_room_bounds(p_anime_id) b;
    SELECT a.episode_total INTO total FROM public.anime a WHERE a.id = p_anime_id;

    target := p_episode_number - COALESCE(season_start, 1) + 1;
    IF target < 1 OR target <= current_progress OR target > total THEN
        RETURN;
    END IF;

    UPDATE public.user_anime_list l
       SET progress = target
     WHERE l.user_id = auth.uid()
       AND l.anime_id = p_anime_id;

    previous_progress := current_progress;
    new_progress := target;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_mylist_progress_from_room(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_mylist_progress_from_room(integer, integer) TO authenticated, service_role;
