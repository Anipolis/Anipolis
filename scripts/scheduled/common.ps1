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

function Get-CopyrightSeasonTargets {
    # © 収集の対象: 前期・今期・次期を "2026-fall" 形式で返す。前期は放送後に増える ©、
    # 次期は告知とともに公開される公式サイトの © を拾うため。
    $current = (Get-SeasonTargets)[0]
    $names = @("winter", "spring", "summer", "fall")
    $index = [Array]::IndexOf($names, $current.Season)
    $targets = @()
    foreach ($offset in @(-1, 0, 1)) {
        $i = $index + $offset
        $year = $current.Year
        if ($i -lt 0) { $i += 4; $year -= 1 }
        elseif ($i -gt 3) { $i -= 4; $year += 1 }
        $targets += ([string]$year + "-" + $names[$i])
    }
    return $targets
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
    try {
        Update-SyncStateAndAlert -Name $base -ExitCode $ExitCode -LogFile $script:LogFile
    } catch {
        Write-Host ("warning: sync state/alert update failed: " + $_.Exception.Message)
    }
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
    if ($code -ne 0) {
        Write-Host ("!!! " + $Label + " failed (exit " + $code + ")")
        $script:FailedSteps += $Label
    }
    return [int]$code
}

# ---- 失敗の知らせ（#596） ----
# 同期が黙って3週間失敗していたことへの対策。結果を .sync-logs/state-<名前>.json に残し、
# 失敗したとき・続けて失敗しているステップがあるとき・失敗から戻ったときに Discord の
# Webhook へ知らせる。Webhook の URL は環境変数か .env の SYNC_ALERT_WEBHOOK_URL。
# 未設定なら知らせは送らず、状態ファイルだけ更新する。
$script:FailedSteps = @()
# 警告扱いのステップでも、この回数続けて失敗したら一度だけ知らせる（慣れて見過ごさないため。毎回は送らない）
$script:StepStreakAlertThreshold = 3

function Get-EnvFileValue {
    param([string]$Name)
    $fromEnv = [System.Environment]::GetEnvironmentVariable($Name)
    if ($fromEnv) { return $fromEnv }
    $envFile = Join-Path $script:RepoRoot ".env"
    if (-not (Test-Path $envFile)) { return $null }
    foreach ($line in [System.IO.File]::ReadAllLines($envFile, [System.Text.Encoding]::UTF8)) {
        if ($line -match ('^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*)$')) {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

function Get-SyncState {
    param([string]$Name)
    $path = Join-Path $script:LogDir ("state-" + $Name + ".json")
    $state = @{ lastSuccessAt = $null; lastRunAt = $null; firstObservedAt = $null; consecutiveFailures = 0; stepStreaks = @{} }
    if (Test-Path $path) {
        try {
            $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
            if ($raw.lastSuccessAt) { $state.lastSuccessAt = [string]$raw.lastSuccessAt }
            if ($raw.lastRunAt) { $state.lastRunAt = [string]$raw.lastRunAt }
            if ($raw.PSObject.Properties.Name -contains "firstObservedAt" -and $raw.firstObservedAt) {
                $state.firstObservedAt = [string]$raw.firstObservedAt
            }
            if ($raw.consecutiveFailures) { $state.consecutiveFailures = [int]$raw.consecutiveFailures }
            if ($raw.stepStreaks) {
                foreach ($p in $raw.stepStreaks.PSObject.Properties) { $state.stepStreaks[$p.Name] = [int]$p.Value }
            }
        } catch {
            Write-Host ("warning: could not read " + $path + ": " + $_.Exception.Message)
        }
    }
    return $state
}

function Save-SyncState {
    param([string]$Name, [hashtable]$State)
    $path = Join-Path $script:LogDir ("state-" + $Name + ".json")
    $json = $State | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-DaysSince {
    param([string]$IsoText)
    if (-not $IsoText) { return $null }
    try {
        $then = [DateTime]::Parse($IsoText, [System.Globalization.CultureInfo]::InvariantCulture)
        return [int][Math]::Floor(((Get-JstNow) - $then).TotalDays)
    } catch { return $null }
}

function Send-SyncAlert {
    param([string]$Message)
    $url = Get-EnvFileValue -Name "SYNC_ALERT_WEBHOOK_URL"
    if (-not $url) {
        Write-Host "SYNC_ALERT_WEBHOOK_URL is not set; alert not sent"
        return
    }
    # Discord の content は 2000 文字まで
    if ($Message.Length -gt 1900) { $Message = $Message.Substring(0, 1900) + "`n…" }
    $body = @{ content = $Message } | ConvertTo-Json -Compress
    try {
        # PowerShell 5.1 は既定で本文を UTF-8 にしないため、バイト列で送る
        Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json; charset=utf-8" `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20 | Out-Null
    } catch {
        Write-Host ("warning: could not send sync alert: " + $_.Exception.Message)
    }
}

function Update-SyncStateAndAlert {
    # Stop-SyncLog から呼ぶ。ログ（トランスクリプト）を閉じた後なので Write-Host はログに残らない。
    param([string]$Name, [int]$ExitCode, [string]$LogFile)
    $state = Get-SyncState -Name $Name
    $nowText = (Get-JstNow).ToString("yyyy-MM-ddTHH:mm:ss")
    $previousFailures = $state.consecutiveFailures
    $daysSinceSuccess = Get-DaysSince -IsoText $state.lastSuccessAt
    $state.lastRunAt = $nowText
    if ($ExitCode -eq 0) {
        $state.lastSuccessAt = $nowText
        $state.consecutiveFailures = 0
    } else {
        $state.consecutiveFailures = $previousFailures + 1
    }
    # ステップごとの連続失敗。今回失敗しなかったステップは数え直す
    $streaks = @{}
    foreach ($label in ($script:FailedSteps | Select-Object -Unique)) {
        $count = 1
        if ($state.stepStreaks.ContainsKey($label)) { $count = $state.stepStreaks[$label] + 1 }
        $streaks[$label] = $count
    }
    $state.stepStreaks = $streaks
    Save-SyncState -Name $Name -State $state

    $longStreaks = @($streaks.GetEnumerator() | Where-Object { $_.Value -eq $script:StepStreakAlertThreshold })
    $lines = @()
    if ($ExitCode -ne 0) {
        $lines += ("[Anipolis] " + $Name + " が失敗しました（" + $state.consecutiveFailures + " 回連続）")
        if ($null -ne $daysSinceSuccess) { $lines += ("最後に成功: " + $state.lastSuccessAt + "（" + $daysSinceSuccess + " 日前）") }
        else { $lines += "最後に成功: 記録なし" }
    } elseif ($longStreaks.Count -gt 0) {
        $lines += ("[Anipolis] " + $Name + " は成功しましたが、続けて失敗しているステップがあります")
    } elseif ($previousFailures -gt 0) {
        Send-SyncAlert -Message ("[Anipolis] " + $Name + " が復旧しました（" + $previousFailures + " 回の失敗のあと成功）")
        return
    } else {
        return
    }
    if ($script:FailedSteps.Count -gt 0) {
        $lines += "失敗したステップ:"
        foreach ($label in ($script:FailedSteps | Select-Object -Unique)) {
            $lines += ("- " + $label + "（" + $streaks[$label] + " 回連続）")
        }
    }
    if ($LogFile -and (Test-Path $LogFile)) {
        $tail = Get-Content -Path $LogFile -Tail 15 -Encoding UTF8 | Where-Object { $_ -notmatch '^\*+$' }
        $lines += "ログの末尾:"
        $lines += '```'
        $lines += ($tail -join "`n")
        $lines += '```'
        $lines += ("ログ: " + $LogFile)
    }
    Send-SyncAlert -Message ($lines -join "`n")
}

function Test-StaleSync {
    # PC が止まっていてタスク自体が動かなかった場合は失敗の知らせも出ない。日次から週次の
    # 最終成功日を見て、古すぎれば知らせる（$Name の最終成功が $MaxDays 日より前）。
    # 一度も成功していない（導入後に一度も起動していない）タスクは、最初に見た日時を
    # firstObservedAt に残し、そこから $MaxDays 日を過ぎたら知らせる。
    param([string]$Name, [int]$MaxDays)
    $state = Get-SyncState -Name $Name
    if ($state.lastSuccessAt) {
        $days = Get-DaysSince -IsoText $state.lastSuccessAt
        if ($null -ne $days -and $days -gt $MaxDays) {
            Write-Host ("warning: " + $Name + " last succeeded " + $days + " days ago")
            Send-SyncAlert -Message ("[Anipolis] " + $Name + " が " + $days + " 日間成功していません（最後に成功: " + $state.lastSuccessAt + "）")
        }
        return
    }
    if (-not $state.firstObservedAt) {
        $state.firstObservedAt = (Get-JstNow).ToString("yyyy-MM-ddTHH:mm:ss")
        Save-SyncState -Name $Name -State $state
        return
    }
    $days = Get-DaysSince -IsoText $state.firstObservedAt
    if ($null -ne $days -and $days -gt $MaxDays) {
        Write-Host ("warning: " + $Name + " has never succeeded since " + $state.firstObservedAt)
        Send-SyncAlert -Message ("[Anipolis] " + $Name + " が一度も成功していません（見張り始め: " + $state.firstObservedAt + "、" + $days + " 日前）")
    }
}
