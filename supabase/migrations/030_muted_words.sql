CREATE TABLE IF NOT EXISTS public.muted_words (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    word       text NOT NULL CHECK (char_length(btrim(word)) BETWEEN 1 AND 80),
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (user_id, word)
);

CREATE INDEX IF NOT EXISTS idx_muted_words_user_id
    ON public.muted_words (user_id, created_at DESC);

ALTER TABLE public.muted_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "muted_words: users can select own rows"
    ON public.muted_words FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "muted_words: users can insert own rows"
    ON public.muted_words FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "muted_words: users can delete own rows"
    ON public.muted_words FOR DELETE
    USING (auth.uid() = user_id);
