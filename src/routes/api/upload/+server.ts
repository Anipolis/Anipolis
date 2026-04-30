import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    if (!user) error(401, 'ログインが必要です');

    // Fast rejection for clients that send Content-Length (they can lie, but worth the early check)
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_FILE_SIZE) error(413, 'ファイルサイズが大きすぎます（最大5MB）');

    // Stream body with a hard size cap before any parsing
    const contentType = request.headers.get('content-type') ?? '';
    if (!request.body) error(400, 'ファイルが指定されていません');

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_FILE_SIZE) {
            await reader.cancel();
            error(413, 'ファイルサイズが大きすぎます（最大5MB）');
        }
        chunks.push(value);
    }

    // Reassemble and delegate multipart parsing to the native API
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }

    const form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
    const file = form.get('file') as File | null;

    if (!file || file.size === 0) error(400, 'ファイルが指定されていません');
    if (!ALLOWED_TYPES.includes(file.type)) error(400, '対応していないファイル形式です（JPEG/PNG/GIF/WebP）');
    if (file.size > MAX_FILE_SIZE) error(400, 'ファイルサイズが大きすぎます（最大5MB）');

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(path, arrayBuffer, { contentType: file.type });

    if (uploadError) {
        console.error('upload error:', uploadError);
        error(500, 'アップロードに失敗しました');
    }

    const { data: { publicUrl } } = supabase.storage
        .from('post-images')
        .getPublicUrl(path);

    return json({ url: publicUrl });
};
