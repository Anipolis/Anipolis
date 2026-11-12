# 日次: しょぼい番組表の同期（カタログ全体の確定マッピング、ローリング窓）。
# 旧ワークフローの "Sync program table (daily)" と同じ。毎日 05:15 JST。
# 続けて管理画面で差し替えたカバーのサムネイルを作り直し（失敗しても表示は原寸へフォールバックする）、
# 作品の共有用カード（OGP）の未作成分を作る。
. (Join-Path $PSScriptRoot "common.ps1")

Start-SyncLog -Name "daily-sync"
$exit = 0
try {
    $current = (Get-SeasonTargets)[0]
    $tag = [string]$current.Year + "-" + $current.Season
    $exit = Invoke-Step -Label ("sync:syobocal-programs " + $tag) `
        -PnpmArgs @("sync:syobocal-programs", "--", "--year", [string]$current.Year, "--season", $current.Season)
    $thumbExit = Invoke-Step -Label "generate:cover-thumbnails" -PnpmArgs @("generate:cover-thumbnails")
    if ($exit -eq 0) { $exit = $thumbExit }
    # 前期・今期・次期の作品の共有用カード（#271）。未作成分だけ作る。無くても既定の画像が出るので
    # 失敗は終了コードに含めない（3 回続けて失敗したら知らせが来る）
    Invoke-Step -Label "generate:anime-og-cards" -PnpmArgs @("generate:anime-og-cards") | Out-Null
    # 週次（月曜）が動いていない・失敗し続けている場合に気づけるよう、最終成功から 8 日を超えたら知らせる
    Test-StaleSync -Name "weekly-sync" -MaxDays 8
} catch {
    Write-Host ("!!! unhandled: " + $_.Exception.Message)
    $exit = 1
} finally {
    Stop-SyncLog -ExitCode $exit
}
exit $exit
