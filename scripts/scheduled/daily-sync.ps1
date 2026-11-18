# 日次: しょぼい番組表の同期（カタログ全体の確定マッピング、ローリング窓）。
# 旧ワークフローの "Sync program table (daily)" と同じ。毎日 05:15 JST。
# 続けて管理画面で差し替えたカバーのサムネイルを作り直し（失敗しても表示は原寸へフォールバックする）、
# 作品の共有用カード（OGP）の未作成分を作り、しょぼいの対応を点検する（#593）。
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
    # しょぼいの対応の点検（#593）。分割2クールの第2クールで新しい TID ができ、本放送の枠が入らない作品を洗い出す。
    # まだ知らせていない問題があるときだけ Discord へ知らせる。知らせ済みにするのは送信に成功してから
    # （送信に失敗したら翌日もう一度知らせる）。点検の失敗は終了コードに含めない
    $auditState = Join-Path $script:LogDir "state-syobocal-audit.json"
    $auditAlert = Join-Path $script:LogDir "syobocal-audit-alert.txt"
    $auditKeys = $auditAlert + ".keys.json"
    Invoke-Step -Label "audit:syobocal-mappings" -PnpmArgs @("audit:syobocal-mappings", "--", "--state", $auditState, "--alert-out", $auditAlert) | Out-Null
    if (Test-Path $auditAlert) {
        Send-SyncAlert -Message ([System.IO.File]::ReadAllText($auditAlert, [System.Text.Encoding]::UTF8))
        if ($script:LastAlertSent -and (Test-Path $auditKeys)) {
            Invoke-Step -Label "audit:syobocal-mappings (mark notified)" -PnpmArgs @("audit:syobocal-mappings", "--", "--state", $auditState, "--mark-notified", $auditKeys) | Out-Null
        }
        Remove-Item -Path $auditAlert -Force
    }
    # 週次（月曜）が動いていない・失敗し続けている場合に気づけるよう、最終成功から 8 日を超えたら知らせる
    Test-StaleSync -Name "weekly-sync" -MaxDays 8
} catch {
    Write-Host ("!!! unhandled: " + $_.Exception.Message)
    $exit = 1
} finally {
    Stop-SyncLog -ExitCode $exit
}
exit $exit
