# scripts/scheduled — ローカル実行のカタログ同期

GitHub Actions で回していた日次・週次の同期を、開発機の Windows タスクスケジューラに移したもの。
GitHub の Additional Product Terms は Actions を「リポジトリのビルド・テスト・デプロイ・公開以外の汎用計算」に
使うことを禁じており、外部 API からの定期同期はこれに当たる（2026年9月に実際に凍結された）。CI にはビルド/テストだけを置く。

| ファイル | 役割 |
|---|---|
| `common.ps1` | JST でのシーズン判定、ログ、pnpm 解決の共通部 |
| `daily-sync.ps1` | 毎日 05:15 JST: `sync:syobocal-programs`（番組表・放送ルーム） |
| `weekly-sync.ps1` | 毎週月曜 04:15 JST: 当季+次季の Jikan/MAL/Wikidata/しょぼい取り込み → resolve → export |
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

外部サイトを大量に巡回する `enrich:jikan-links` / `collect:copyright` / `collect:official-x` / `collect:wayback` は
スケジュールに含めない。必要なときに手動で、`--season` 単位など小さい範囲で実行する。
