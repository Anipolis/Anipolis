# ローカル実行版データ同期の共通部（旧 .github/workflows/syobocal-sync.yml の置き換え）。
# GitHub Actions は「リポジトリのビルド/テスト/デプロイ以外の汎用計算」を禁じているため、
# 日次・週次のカタログ同期は開発機の Windows タスクスケジューラで回す。
# 呼び出し側（daily-sync.ps1 / weekly-sync.ps1）が dot-source して使う。

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script:LogDir = Join-Path $script:RepoRoot ".sync-logs"
if (-not (Test-Path $script:LogDir)) { New-Item -ItemType Directory -Path $script:LogDir | Out-Null }

function Get-JstNow {
    # 実行機のタイムゾーンに依存せず JST で判定する（旧ワークフローの TZ=Asia/Tokyo 相当）
    $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Tokyo Standard Time")
    return [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
}

function Get-SeasonTargets {
    # 現在シーズンと次シーズンを返す。旧ワークフローの月→シーズン判定と同一。
    $now = Get-JstNow
    $year = $now.Year
    $month = $now.Month
    if ($month -le 3) { $season = "winter"; $next = "spring"; $nextYear = $year }
    elseif ($month -le 6) { $season = "spring"; $next = "summer"; $nextYear = $year }
    elseif ($month -le 9) { $season = "summer"; $next = "fall"; $nextYear = $year }
    else { $season = "fall"; $next = "winter"; $nextYear = $year + 1 }
    return @(
        @{ Year = $year; Season = $season },
        @{ Year = $nextYear; Season = $next }
    )
}

function Start-SyncLog {
    param([string]$Name)
    $startedAt = Get-JstNow
    $stamp = $startedAt.ToString("yyyyMMdd-HHmm")
    $script:LogFile = Join-Path -Path $script:LogDir -ChildPath ($Name + "-" + $stamp + ".log")
    Start-Transcript -Path $script:LogFile -Append | Out-Null
    Write-Host ("=== " + $Name + " started " + $startedAt + " JST ===")
    # 古いログは 60 日で間引く
    Get-ChildItem $script:LogDir -Filter "*.log" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-60) } |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

function Stop-SyncLog {
    param([int]$ExitCode)
    $finishedAt = Get-JstNow
    Write-Host ("=== finished " + $finishedAt + " JST exit=" + $ExitCode + " ===")
    Stop-Transcript | Out-Null
    # 直近の結果を固定名でも残す（監視や手動確認用）: daily-sync-20260910-0515.log -> last-daily-sync.log
    $leaf = Split-Path -Path $script:LogFile -Leaf
    $base = $leaf -replace '-[0-9]{8}-[0-9]{4}\.log$', ''
    $latest = Join-Path -Path $script:LogDir -ChildPath ("last-" + $base + ".log")
    Copy-Item -Path $script:LogFile -Destination $latest -Force
}

function Resolve-Pnpm {
    # タスクスケジューラ実行時は PATH が最小構成のことがあるため、明示的に探す
    $cmd = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($candidate in @(
        (Join-Path $env:APPDATA "npm\pnpm.cmd"),
        (Join-Path $env:LOCALAPPDATA "pnpm\pnpm.cmd"),
        (Join-Path $env:LOCALAPPDATA "pnpm\pnpm.exe")
    )) { if (Test-Path $candidate) { return $candidate } }
    throw "pnpm が見つかりません。register-tasks.ps1 を pnpm が使えるユーザーで実行してください。"
}

function Invoke-Step {
    # 1 ステップ = 1 つの pnpm スクリプト。失敗時の扱いは呼び出し側が決める。
    param(
        [string]$Label,
        [string[]]$PnpmArgs
    )
    $pnpm = Resolve-Pnpm
    Write-Host ("--- " + $Label + " : pnpm " + ($PnpmArgs -join " "))
    Set-Location $script:RepoRoot
    # pnpm の標準出力・標準エラーをどちらもホスト(=トランスクリプト)へ流す。そのまま
    # 流すと関数の戻り値(パイプライン出力)に混ざり、呼び出し側の $code が配列になる。
    # 標準エラーを合流させないと Node の例外本文がログに残らず、失敗理由が追えない
    # (PowerShell 5.1 は native の stderr 行を ErrorRecord に包む)。
    # $ErrorActionPreference が Stop のままだと、その ErrorRecord が終了エラーになって
    # pnpm の完了前に関数ごと中断し、「警告で継続」のはずの Jikan 失敗が週次全体を
    # 止めた(2026-09-21)。pnpm の実行中だけ Continue にし、成否は終了コードで判定する。
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $pnpm @PnpmArgs 2>&1 | ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { $_ } } | Out-Host
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($null -eq $code) { $code = 1 }
    if ($code -ne 0) { Write-Host ("!!! " + $Label + " failed (exit " + $code + ")") }
    return [int]$code
}
