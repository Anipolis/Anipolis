-- 公開データ成果物（ODbLカタログJSON等）の配信用バケットを作成する。
-- /api/data/anime-catalog がリクエストごとに全レコードをDB走査・メモリ展開して
-- いた構成を、ワークフローで事前生成した静的成果物のストリーミング配信へ変更する。
-- 書き込みは service_role のみ（scripts/export-anime-catalog.ts）。ユーザー
-- ロール向けの INSERT/UPDATE/DELETE ポリシーは意図的に作らない。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'public-data',
    'public-data',
    true,
    52428800, -- 50MB
    ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public-data is publicly accessible" ON storage.objects;
CREATE POLICY "public-data is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-data');
