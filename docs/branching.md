# ブランチ運用

一般的なWebプロジェクトにおける標準的な運用方針として、GitHub Flowに一本化する。

## ブランチ構成

- `master`: 本番直結のメインライン兼デフォルトブランチ。すべてのPull Requestのマージ先（base）は`master`とする。
- 常設の`develop`は持たない。ステージング確認はPull Requestのプレビュー環境・タグ・リリースで代替し、長期滞留ブランチによるコードの乖離を防ぐ。
- 作業ブランチは`feat/<内容>`、`fix/<内容>`、`chore/<内容>`など、目的が明確に分かる名前とする。

## 作業手順

作業ブランチは最新の`origin/master`から分岐して作成する。リモートへプッシュする前に、最新の`origin/master`をベースにリベースする。

```sh
git fetch origin
git checkout -b feat/xxx origin/master
# 作業・コミット
git fetch origin
git rebase origin/master
git push -u origin feat/xxx
```

## Pull Request 規則

- マージ先（base）は`master`のみとする。`develop`や他のブランチをbaseとするPull Requestは却下する。
- `master`への直接pushは禁止とする。変更は必ずPull Request経由で取り込む。
- Pull Requestを作成する前に、手元で`pnpm check`および`pnpm test`を実行してパスさせる。
- 作成されたPull RequestはCodeRabbitによって自動レビューされる（設定は`.coderabbit.yaml`）。

## マージ規則

- マージ方式はSquashマージに統一し、`master`のコミット履歴を直線的に保つ。マージコミット（Merge commit）の作成や方式の使い分けは行わない。
- マージ条件として、`.github/workflows/verification.yml`のパス（`pnpm check` / `pnpm test` / `pnpm deploy:dry-run`）およびレビュー承認を必須とする。

## リリース

- リリースが必要な場合は、`master`に`vX.Y.Z`形式のGitタグを付与して区切りとする。
- バージョン保守用の長期ブランチは作成しない。

## 禁止事項

- 常設`develop`ブランチの復活
- `develop`経由でのみ`master`へ反映する二段運用
- 旧`develop`からの作業ブランチ作成
- CI未通過・レビュー未承認でのマージ
