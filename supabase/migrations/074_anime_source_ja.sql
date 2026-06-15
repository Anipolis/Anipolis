-- Normalize anime source values to Japanese display/search values.

UPDATE public.anime
SET source = CASE lower(source)
    WHEN '4-koma manga' THEN '4コマ漫画'
    WHEN 'book' THEN '書籍'
    WHEN 'card game' THEN 'カードゲーム'
    WHEN 'game' THEN 'ゲーム'
    WHEN 'light novel' THEN 'ライトノベル'
    WHEN 'manga' THEN '漫画'
    WHEN 'mixed media' THEN 'メディアミックス'
    WHEN 'music' THEN '音楽'
    WHEN 'novel' THEN '小説'
    WHEN 'original' THEN 'オリジナル'
    WHEN 'other' THEN 'その他'
    WHEN 'picture book' THEN '絵本'
    WHEN 'radio' THEN 'ラジオ'
    WHEN 'visual novel' THEN 'ビジュアルノベル'
    WHEN 'web manga' THEN 'Web漫画'
    ELSE source
END
WHERE source IS NOT NULL;
