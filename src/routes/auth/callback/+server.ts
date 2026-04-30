import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Google OAuth のコールバックを処理する
 * Supabase が ?code=xxx を付けてここにリダイレクトしてくる
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
    const code = url.searchParams.get('code');
    const raw = url.searchParams.get('next') ?? '/';
    const safeNext = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes(':/') ? raw : '/';

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            redirect(303, safeNext);
        }
    }

    // エラー時はホームへ
    redirect(303, '/');
};
