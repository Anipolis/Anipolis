-- anime-covers バケットで AVIF 形式のカバー画像を許可する
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
WHERE id = 'anime-covers';
