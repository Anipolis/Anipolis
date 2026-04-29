import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
    const { user } = await safeGetSession();
    // 未ログインはホームへ
    if (!user) redirect(303, '/');
    // profile はレイアウトデータ（parent）から供給されるのでここでは返さない
    return {};
};

export const actions: Actions = {
    update: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });

        const form = await request.formData();
        const username = (form.get('username') as string | null)?.trim().toLowerCase() ?? '';
        const displayName = (form.get('display_name') as string | null)?.trim() || null;
        const bio = (form.get('bio') as string | null)?.trim() || null;

        if (!username)
            return fail(400, { field: 'username', message: 'ユーザー名を入力してください' });
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
            return fail(400, {
                field: 'username',
                message: 'ユーザー名は3〜20文字の半角英数字・アンダースコアのみ使用できます',
            });
        if (bio && bio.length > 160)
            return fail(400, { field: 'bio', message: '自己紹介は160文字以内で入力してください' });

        const { error } = await supabase
            .from('profiles')
            .upsert(
                { id: user.id, username, display_name: displayName, bio },
                { onConflict: 'id' },
            );

        if (error) {
            if (error.code === '23505')
                return fail(400, {
                    field: 'username',
                    message: 'このユーザー名はすでに使用されています',
                });
            return fail(500, { message: 'プロフィールの更新に失敗しました' });
        }

        return { success: true };
    },
};
