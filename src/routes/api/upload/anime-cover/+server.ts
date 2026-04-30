import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ADMIN_EMAIL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) error(401, 'ログインが必要です');
    if (user.email !== ADMIN_EMAIL) error(403, '権限がありません');

    const form = await request.formData();
    const fileEntry = form.get('file');
    const animeIdEntry = form.get('anime_id');

    if (!(fileEntry instanceof File) || fileEntry.size === 0) error(400, 'ファイルが指定されていません');
    const file = fileEntry;

    if (typeof animeIdEntry !== 'string') error(400, 'アニメIDが指定されていません');
    const animeId = animeIdEntry.trim();
    if (animeId.length === 0) error(400, 'アニメIDが指定されていません');
    if (/[/\\:\0]/.test(animeId)) error(400, 'アニメIDに無効な文字が含まれています');

    if (!ALLOWED_TYPES.includes(file.type)) error(400, '対応していないファイル形式です（JPEG/PNG/WebP）');
    if (file.size > MAX_FILE_SIZE) error(400, 'ファイルサイズが大きすぎます（最大10MB）');

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${animeId}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
        .from('anime-covers')
        .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

    if (uploadError) {
        console.error('anime cover upload error:', uploadError);
        error(500, 'アップロードに失敗しました');
    }

    const { data: { publicUrl } } = supabase.storage
        .from('anime-covers')
        .getPublicUrl(path);

    const adminClient = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: updatedRow, error: updateError } = await adminClient
        .from('anime')
        .update({ cover_url: publicUrl })
        .eq('id', animeId)
        .select('id')
        .single();

    if (updateError || !updatedRow) {
        console.error('anime cover_url update error (animeId=%s):', animeId, updateError ?? 'no matching row');
        const { error: deleteError } = await adminClient.storage
            .from('anime-covers')
            .remove([path]);
        if (deleteError) {
            console.error('anime cover storage cleanup error (path=%s):', path, deleteError);
        }
        error(500, 'DBの更新に失敗しました');
    }

    return json({ url: publicUrl });
};
