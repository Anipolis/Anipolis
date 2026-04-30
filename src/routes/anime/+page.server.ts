import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { Anime } from '$lib/types';
import {
    getAnimeList,
    getAnimeRankingPopularity,
    getAnimeRankingTrending,
    getAnimeRankingTopRated,
    getUserAnimeList,
} from '$lib/server/queries';

type Tab = 'popular' | 'trending' | 'top_rated' | 'mylist' | 'airing' | 'upcoming' | 'register';

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    const tab = (url.searchParams.get('tab') as Tab) ?? 'popular';
    const search = url.searchParams.get('search')?.trim() ?? '';
    const genre = url.searchParams.get('genre')?.trim() ?? '';
    const season = url.searchParams.get('season')?.trim() ?? '';
    const studio = url.searchParams.get('studio')?.trim() ?? '';
    const producer = url.searchParams.get('producer')?.trim() ?? '';

    let animes: Anime[];

    if (search) {
        animes = await getAnimeList(supabase, { query: search, limit: 1000, userId: user?.id ?? null });
    } else if (genre) {
        animes = await getAnimeList(supabase, { genre, limit: 1000, userId: user?.id ?? null });
    } else if (season) {
        animes = await getAnimeList(supabase, { season, limit: 1000, userId: user?.id ?? null });
    } else if (studio) {
        animes = await getAnimeList(supabase, { studio, limit: 1000, userId: user?.id ?? null });
    } else if (producer) {
        animes = await getAnimeList(supabase, { producer, limit: 1000, userId: user?.id ?? null });
    } else if (tab === 'mylist') {
        animes = user ? await getUserAnimeList(supabase, user.id) : [];
    } else if (tab === 'trending') {
        animes = await getAnimeRankingTrending(supabase, 1000);
    } else if (tab === 'top_rated') {
        animes = await getAnimeRankingTopRated(supabase, 1000);
    } else if (tab === 'airing') {
        animes = await getAnimeList(supabase, { status: 'airing', limit: 1000, userId: user?.id ?? null });
    } else if (tab === 'upcoming') {
        animes = await getAnimeList(supabase, { status: 'upcoming', limit: 1000, userId: user?.id ?? null });
    } else if (tab === 'register') {
        animes = [];
    } else {
        animes = await getAnimeRankingPopularity(supabase, 1000);
    }

    return { animes, tab, search, genre, season, studio, producer, user };
};

export const actions: Actions = {
    upsertWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });
        const { upsertUserAnimeEntry } = await import('$lib/server/actions');
        return upsertUserAnimeEntry(supabase, request, user.id);
    },

    registerAnime: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });

        const fd = await request.formData();
        const title = (fd.get('title') as string)?.trim();
        if (!title) return fail(400, { message: 'タイトルは必須です' });

        const toArr = (vals: FormDataEntryValue[]) =>
            vals.map((v) => (v as string).trim()).filter(Boolean);

        const epRaw = fd.get('episode_count') as string;

        const { data, error } = await supabase
            .from('anime')
            .insert({
                title,
                title_en:         (fd.get('title_en') as string)?.trim() || null,
                title_romaji:     (fd.get('title_romaji') as string)?.trim() || null,
                synopsis:         (fd.get('synopsis') as string)?.trim() || null,
                season:           (fd.get('season') as string)?.trim() || null,
                episode_count:    epRaw ? parseInt(epRaw, 10) : null,
                type:             (fd.get('type') as string)?.trim() || null,
                status:           (fd.get('status') as string)?.trim() || null,
                aired_from:       (fd.get('aired_from') as string)?.trim() || null,
                aired_to:         (fd.get('aired_to') as string)?.trim() || null,
                source:           (fd.get('source') as string)?.trim() || null,
                genre:            toArr(fd.getAll('genre')),
                studio:           toArr(fd.getAll('studio')),
                producer:         toArr(fd.getAll('producer')),
                official_hashtag: toArr(fd.getAll('official_hashtag')),
                official_site_url:(fd.get('official_site_url') as string)?.trim() || null,
                official_x_url:   (fd.get('official_x_url') as string)?.trim() || null,
                copyright:        (fd.get('copyright') as string)?.trim() || null,
            })
            .select('id')
            .single();

        if (error) return fail(500, { message: `登録エラー: ${error.message}` });
        return { success: true, animeId: (data as { id: string }).id };
    },
};
