-- マイリストの公開/非公開設定をprofilesテーブルに追加
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS list_is_public boolean DEFAULT true NOT NULL;
