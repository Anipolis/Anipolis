import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getNotifications } from '$lib/server/queries';
import { markAllNotificationsRead } from '$lib/server/actions';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession }, parent }) => {
    const { user } = await safeGetSession();
    if (!user) redirect(302, '/');

    await parent();

    // ページ読み込み時に全通知を既読にする
    await markAllNotificationsRead(supabase, user.id);

    const notifications = await getNotifications(supabase, user.id);

    return { notifications };
};
