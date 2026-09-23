# Anipolis

アニメ実況SNSプラットフォーム

## 開発

### 依存関係インストール

```sh
mise install
pnpm install
```

### 開発サーバー起動

```sh
pnpm dev
```

## ビルド

```sh
pnpm build
```

## 型チェック・フォーマット

```sh
pnpm check
```

## ユニットテスト

```sh
pnpm test
```

## 共同開発

リポジトリは GitHub の [Anipolis/Anipolis](https://github.com/Anipolis/Anipolis) にあります。

### 初回セットアップ

1. リポジトリをクローンする
   ```sh
   git clone https://github.com/Anipolis/Anipolis.git
   ```
2. `.env.example` を `.env` にコピーし、値はメンテナーから別経路（チャット等）で受け取る。`.env` はコミットしない。
3. 上記の「開発」手順どおり `mise install` → `pnpm install` → `pnpm dev`

### ブランチとマージの流れ

- `master` … 本番。`develop` からのマージのみ
- `develop` … 統合ブランチ。作業ブランチからの Pull Request で取り込む
- 作業ブランチは `feat/…` `fix/…` `chore/…` など目的が分かる名前で `develop` から切り、Pull Request の base も `develop` にする
- CodeRabbit が Pull Request を自動レビューする（設定は `.coderabbit.yaml`）

### GitHub Actions の使い方

GitHub Actions は **リポジトリ自身のビルド・テスト（`.github/workflows/verification.yml`）だけ**に使います。
外部 API からのデータ同期や外部サイトの巡回など、ビルド/テスト/デプロイ以外の処理を Actions に置くことは
GitHub の利用規約（Additional Product Terms）に反し、2026年9月に実際にアカウントが凍結されました。二度と戻さないでください。

- カタログの定期同期（しょぼい・MAL・Wikidata）はメンテナーの開発機のタスクスケジューラで動いています。詳細は [scripts/scheduled/README.md](scripts/scheduled/README.md)
- 本番（Cloudflare Pages）へのデプロイは別メンバーが管理しています。手元から直接出す場合は `pnpm exec wrangler login` のあと `pnpm deploy`
- Pull Request を出す前に手元でも `pnpm check` / `pnpm test` を通してください

## ライセンス


このプロジェクトは、[MIT License](LICENSE)の下で開発されています。
