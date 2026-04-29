import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getEventsByMonth } from '$lib/server/queries';

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();

    const now = new Date();
    const year = Math.max(
        2020,
        Math.min(2099, parseInt(url.searchParams.get('year') ?? String(now.getFullYear()))),
    );
    const month = Math.max(
        1,
        Math.min(12, parseInt(url.searchParams.get('month') ?? String(now.getMonth() + 1))),
    );

    const events = await getEventsByMonth(supabase, year, month);

    return { year, month, events, user };
};

export const actions: Actions = {
    /**
     * カレンダーからイベントをすぐに作成し、ルームへ遷移する。
     * scheduled_at = NOW なのでルーム入室と同時にタイマーが 0 からカウントアップする。
     */
    createEvent: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });

        const form = await request.formData();
        const title = (form.get('title') as string | null)?.trim() ?? '';
        const rawHashtag = (form.get('hashtag') as string | null)?.trim() ?? '';
        const durationRaw = (form.get('duration_minutes') as string | null)?.trim() ?? '';

        if (!title) return fail(400, { message: 'タイトルを入力してください' });
        if (title.length > 100) return fail(400, { message: 'タイトルは100文字以内で入力してください' });

        const hashtag = rawHashtag.replace(/^#/, '').toLowerCase();
        if (!hashtag) return fail(400, { message: 'ハッシュタグを入力してください' });
        if (hashtag.length > 50) return fail(400, { message: 'ハッシュタグは50文字以内で入力してください' });

        const durationMinutes = durationRaw ? parseInt(durationRaw, 10) : null;
        if (durationMinutes !== null && (isNaN(durationMinutes) || durationMinutes <= 0)) {
            return fail(400, { message: '配信時間は正の整数で入力してください' });
        }

        const { data: event, error: err } = await supabase
            .from('events')
            .insert({
                creator_id: user.id,
                title,
                hashtag,
                scheduled_at: new Date().toISOString(), // 即座に LIVE 状態になる
                duration_minutes: durationMinutes,
            })
            .select('id')
            .single();

        if (err || !event) {
            console.error('event create error:', err);
            return fail(500, { message: 'イベントの作成に失敗しました' });
        }

        redirect(303, `/events/${event.id}`);
    },
};
