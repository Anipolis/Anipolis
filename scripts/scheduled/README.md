# scripts/scheduled — ローカル実行のカタログ同期

GitHub Actions で回していた日次・週次の同期を、開発機の Windows タスクスケジューラに移したもの。
GitHub の Additional Product Terms は Actions を「リポジトリのビルド・テスト・デプロイ・公開以外の汎用計算」に
使うことを禁じており、外部 API からの定期同期はこれに当たる（2026年9月に実際に凍結された）。CI にはビルド/テストだけを置く。

| ファイル | 役割 |
|---|---|
| `common.ps1` | JST でのシーズン判定、ログ、pnpm 解決の共通部 |
| `daily-sync.ps1` | 毎日 05:15 JST: `sync:syobocal-programs`（番組表・放送ルーム）→ `generate:cover-thumbnails`（カバーのサムネイル） |
| `weekly-sync.ps1` | 毎週月曜 04:15 JST: 当季+次季の Jikan/MAL/Wikidata/しょぼい取り込み → resolve → 前期・今期・次期の © 収集（`collect:copyright` → `import:annict` → `resolve:copyright-seasons`）→ export |
| `register-tasks.ps1` | タスクスケジューラへの登録・解除 |

## セットアップ

```powershell
powershell -ExecutionPolicy Bypass -File scripts/scheduled/register-tasks.ps1
Start-ScheduledTask -TaskName "Anipolis daily sync"   # 動作確認
Get-Content .sync-logs\last-daily-sync.log -Tail 20
```

- 認証情報はリポジトリ直下の `.env` から読む（各 pnpm スクリプトの `--env-file-if-exists=.env`）。
- 時刻は **PC のタイムゾーンが Tokyo Standard Time であること**が前提。トリガーの `-At` はローカル時刻なので、他のタイムゾーンの PC では登録を拒否する。
- 既定ではログオン中のみ実行される（Interactive）。ログオン前にも走らせたい場合は、**管理者として起動した PowerShell** で `register-tasks.ps1` を実行すると S4U（パスワード保存なしで「ログオンの有無にかかわらず実行」）で登録される。
- PC が起動していない時刻の実行は、次回起動時に繰り越される（`StartWhenAvailable`）。
- ログは `.sync-logs/`（gitignore 済み）。60 日で自動削除。`last-*.log` が直近結果。

## 含めていないもの

外部サイトを大量に巡回する `enrich:jikan-links` / `collect:official-x` / `collect:wayback` はスケジュールに含めない。
必要なときに手動で、`--season` 単位など小さい範囲で実行する。

`collect:copyright` だけは例外で、週次で前期・今期・次期に限って実行する。対象は「公式サイトあり・© 空欄」の
作品だけなので、埋まった作品は翌週以降巡回しない（1回あたり数十サイト程度）。決めきれなかった © は管理画面の
「©確認」（`/admin/copyright-reviews`）に積まれる。`import:annict` には `.env` の `ANNICT_ACCESS_TOKEN` が必要。
