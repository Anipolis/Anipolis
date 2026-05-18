-- ============================================================
-- Anipolis デモデータ
-- Supabase ダッシュボード → SQL Editor で実行してください
-- ============================================================

DO $$
DECLARE
    taro_id   uuid := 'a0000001-0000-0000-0000-000000000000'::uuid;
    hanako_id uuid := 'a0000002-0000-0000-0000-000000000000'::uuid;
    jiro_id   uuid := 'a0000003-0000-0000-0000-000000000000'::uuid;

    -- ハッシュタグID
    ht_shingeki   bigint;
    ht_anime      bigint;
    ht_freiren    bigint;
    ht_jujutsu    bigint;
    ht_kamisama   bigint;
    ht_kimetsu    bigint;
    ht_onepiece   bigint;
    ht_chainsaw   bigint;

    -- 投稿ID
    p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid;
BEGIN

-- ----------------------------------------------------------------
-- 1. auth.users にデモユーザーを直接追加
--    （SQL Editorはpostgres権限で実行されるためauth.usersに書き込める）
-- ----------------------------------------------------------------
INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data,
    is_super_admin, is_sso_user
)
VALUES
(
    taro_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'demo_taro@anipolis.example', '',
    now() - interval '10 days',
    now() - interval '10 days', now(),
    '{"full_name":"アニメ太郎","name":"アニメ太郎","avatar_url":null}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    false, false
),
(
    hanako_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'demo_hanako@anipolis.example', '',
    now() - interval '8 days',
    now() - interval '8 days', now(),
    '{"full_name":"実況花子","name":"実況花子","avatar_url":null}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    false, false
),
(
    jiro_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'demo_jiro@anipolis.example', '',
    now() - interval '6 days',
    now() - interval '6 days', now(),
    '{"full_name":"神アニメ次郎","name":"神アニメ次郎","avatar_url":null}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    false, false
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 2. profiles（トリガーで自動作成されるが、displayとbioを上書き）
-- ----------------------------------------------------------------
INSERT INTO public.profiles (id, username, display_name, bio, created_at)
VALUES
(taro_id,   'animetaro',     'アニメ太郎',     'アニメ歴10年のオタク。深夜アニメが大好き！',         now() - interval '10 days'),
(hanako_id, 'jikkyohanako',  '実況花子',       '毎週欠かさず実況してます🎉 推し：フリーレン',        now() - interval '8 days'),
(jiro_id,   'kamianime_jiro','神アニメ次郎',   'ジャンプ系アニメ専門。バトルシーン命。',              now() - interval '6 days')
ON CONFLICT (id) DO UPDATE SET
    username     = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    bio          = EXCLUDED.bio;

-- ----------------------------------------------------------------
-- 3. 投稿
-- ----------------------------------------------------------------
p1 := 'a1000001-0000-0000-0000-000000000001'::uuid;
p2 := 'a1000001-0000-0000-0000-000000000002'::uuid;
p3 := 'a1000001-0000-0000-0000-000000000003'::uuid;
p4 := 'a1000001-0000-0000-0000-000000000004'::uuid;
p5 := 'a1000001-0000-0000-0000-000000000005'::uuid;
p6 := 'a1000001-0000-0000-0000-000000000006'::uuid;
p7 := 'a1000001-0000-0000-0000-000000000007'::uuid;

INSERT INTO public.posts (id, user_id, content, created_at) VALUES
(p1, taro_id,
 '進撃の巨人S4E1見た！エレンの変貌がすごすぎる😭 後半のエレンは別人みたい #進撃の巨人 #アニメ',
 now() - interval '5 hours'),

(p2, hanako_id,
 '葬送のフリーレン最終話、泣きすぎて目が腫れてる😭 あんな終わり方ずるいよ… #フリーレン #アニメ',
 now() - interval '3 hours'),

(p3, jiro_id,
 '今週の呪術廻戦、五条先生の無下限術式が完璧に映像化されてて鳥肌すごい🔥 #呪術廻戦 #アニメ',
 now() - interval '2 hours'),

(p4, taro_id,
 'フリーレン見るたびに「ゆっくりとした時間」の大切さを実感する。アニメで泣いたの久しぶり #フリーレン',
 now() - interval '90 minutes'),

(p5, hanako_id,
 '鬼滅の刃 遊郭編のOP（残響散歌）が頭から離れない。毎週スキップできない #鬼滅の刃 #アニメ',
 now() - interval '1 hour'),

(p6, jiro_id,
 'ワンピース1000話の「俺はルフィ！海賊王になる男だ！」シーン、何回見ても熱い😭 伝説の回 #ワンピース #アニメ',
 now() - interval '40 minutes'),

(p7, taro_id,
 'チェンソーマン2期、デンジの作画クオリティ爆上がりしてて嬉しい。MAPPA神すぎ #チェンソーマン #アニメ',
 now() - interval '15 minutes')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 4. ハッシュタグ
-- ----------------------------------------------------------------
INSERT INTO public.hashtags (name) VALUES
('進撃の巨人'), ('アニメ'), ('フリーレン'), ('呪術廻戦'), ('鬼滅の刃'), ('ワンピース'), ('チェンソーマン')
ON CONFLICT (name) DO NOTHING;

SELECT id INTO ht_shingeki FROM public.hashtags WHERE name = '進撃の巨人';
SELECT id INTO ht_anime    FROM public.hashtags WHERE name = 'アニメ';
SELECT id INTO ht_freiren  FROM public.hashtags WHERE name = 'フリーレン';
SELECT id INTO ht_jujutsu  FROM public.hashtags WHERE name = '呪術廻戦';
SELECT id INTO ht_kimetsu  FROM public.hashtags WHERE name = '鬼滅の刃';
SELECT id INTO ht_onepiece FROM public.hashtags WHERE name = 'ワンピース';
SELECT id INTO ht_chainsaw FROM public.hashtags WHERE name = 'チェンソーマン';

-- ----------------------------------------------------------------
-- 5. 投稿 ↔ ハッシュタグ の紐付け
-- ----------------------------------------------------------------
INSERT INTO public.post_hashtags (post_id, hashtag_id) VALUES
(p1, ht_shingeki), (p1, ht_anime),
(p2, ht_freiren),  (p2, ht_anime),
(p3, ht_jujutsu),  (p3, ht_anime),
(p4, ht_freiren),
(p5, ht_kimetsu),  (p5, ht_anime),
(p6, ht_onepiece), (p6, ht_anime),
(p7, ht_chainsaw), (p7, ht_anime)
ON CONFLICT DO NOTHING;

RAISE NOTICE '✅ デモデータの挿入が完了しました（ユーザー3人、投稿7件）';
END $$;
