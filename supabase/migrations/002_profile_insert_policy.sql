-- ============================================================
-- 002: profiles INSERT ポリシーの追加
-- ============================================================
-- getOrCreateProfile フォールバック（DB トリガー未実行時）が
-- supabase クライアント経由で自分の profile を作成できるようにする
CREATE POLICY "profiles: 自分のプロフィールを作成可"
    ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
