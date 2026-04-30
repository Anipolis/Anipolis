import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
    const q = url.searchParams.get('q')?.trim() ?? '';
    if (q.length < 1) return json([]);

    const { data } = await supabase
        .from('anime')
        .select('id, title, title_en, cover_url')
        .or(`title.ilike.%${q}%,title_en.ilike.%${q}%`)
        .order('title', { ascending: true })
        .limit(10);

    return json(data ?? []);
};
