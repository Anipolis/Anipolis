import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) error(401, 'ログインが必要です');

    const form = await request.formData();
    const file = form.get('file') as File | null;

    if (!file || file.size === 0) error(400, 'ファイルが指定されていません');
    if (!ALLOWED_TYPES.includes(file.type)) error(400, '対応していないファイル形式です（JPEG/PNG/WebP）');
    if (file.size > MAX_FILE_SIZE) error(400, 'ファイルサイズが大きすぎます（最大2MB）');

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    // キャッシュ回避のためタイムスタンプを付与
    const path = `${user.id}/avatar_${Date.now()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

    if (uploadError) {
        console.error('avatar upload error:', uploadError);
        error(500, 'アップロードに失敗しました');
    }

    const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(path);

    const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

    if (dbError) {
        console.error('avatar db update error:', dbError);
        error(500, 'プロフィールの更新に失敗しました');
    }

    return json({ url: publicUrl });
};
