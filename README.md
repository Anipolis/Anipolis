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

リポジトリは GitLab の [anipolis-group/anipolis](https://gitlab.com/anipolis-group/anipolis) にあります。

### 初回セットアップ

1. GitLab の Preferences → SSH Keys に自分の公開鍵を登録し、SSH でクローンする
   ```sh
   git clone git@gitlab.com:anipolis-group/anipolis.git
   ```
2. `.env.example` を `.env` にコピーし、値はメンテナーから別経路（チャット等）で受け取る。`.env` はコミットしない。
3. 上記の「開発」手順どおり `mise install` → `pnpm install` → `pnpm dev`

### ブランチとマージの流れ

- `master` … 本番。`develop` からのマージのみ
- `develop` … 統合ブランチ。作業ブランチからの Merge Request で取り込む
- 作業ブランチは `feat/…` `fix/…` `chore/…` など目的が分かる名前で `develop` から切り、Merge Request の target も `develop` にする

### CI は使わない

このリポジトリでは GitLab CI/CD を有効にしません（自動チェック・自動デプロイ・定期ジョブのいずれも CI では動かしません）。
そのぶん **Merge Request を出す前に手元で必ず実行**してください:

```sh
pnpm check   # Biome + svelte-check + tsc
pnpm test    # Vitest
```

- カタログの定期同期（しょぼい・MAL・Wikidata）はメンテナーの開発機のタスクスケジューラで動いています。詳細は [scripts/scheduled/README.md](scripts/scheduled/README.md)
- 本番（Cloudflare Pages）へのデプロイは別メンバーが管理しています。手元から直接出す場合は `pnpm exec wrangler login` のあと `pnpm deploy`

## ライセンス


このプロジェクトは、[MIT License](LICENSE)の下で開発されています。
