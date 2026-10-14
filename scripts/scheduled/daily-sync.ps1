# 日次: しょぼい番組表の同期（カタログ全体の確定マッピング、ローリング窓）。
# 旧ワークフローの "Sync program table (daily)" と同じ。毎日 05:15 JST。
# 続けて管理画面で差し替えたカバーのサムネイルを作り直す（失敗しても表示は原寸へフォールバックする）。
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
} catch {
    Write-Host ("!!! unhandled: " + $_.Exception.Message)
    $exit = 1
} finally {
    Stop-SyncLog -ExitCode $exit
}
exit $exit
