# Windows タスクスケジューラに日次・週次の同期を登録する（開発機で 1 回実行）。
#   powershell -ExecutionPolicy Bypass -File scripts/scheduled/register-tasks.ps1
# 解除: powershell -ExecutionPolicy Bypass -File scripts/scheduled/register-tasks.ps1 -Unregister
# 旧 GitHub Actions のスケジュール（日次 05:15 JST / 週次 月曜 04:15 JST）をそのまま引き継ぐ。
# PC がその時刻に起動していなかった場合は、次に起動したときに実行する（StartWhenAvailable）。
param([switch]$Unregister)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$powershell = (Get-Command powershell.exe).Source

# トリガーの -At は登録する PC のローカル時刻で解釈される。05:15 / 04:15 は JST での
# 時刻なので、JST 以外の PC では別の時刻に走ってしまう。JST の PC だけを対象にし、
# 登録時にタイムゾーンを確認する（DST のあるゾーンへ固定時刻で変換しても JST は保てない）。
$timeZone = [System.TimeZoneInfo]::Local.Id
if (-not $Unregister -and $timeZone -ne "Tokyo Standard Time") {
    throw "この PC のタイムゾーンは '$timeZone' です。同期スケジュール(05:15 / 04:15 JST)は Tokyo Standard Time の PC でのみ登録できます。"
}

# ログオン前でも走らせる: 既定の Interactive だとユーザーのログオン中しか起動しない。
# S4U はパスワードを保存せずに「ログオンの有無にかかわらず実行」できる（.env はファイル、
# 外部アクセスは通常の HTTPS なので S4U の制約に当たらない）。ただし S4U での登録には
# 管理者権限が要る（非昇格だと Access is denied）。昇格していなければ Interactive で
# 登録し、ログオン前実行が必要なら昇格した PowerShell で登録し直すよう案内する。
$isElevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$userId = "$env:USERDOMAIN\$env:USERNAME"
if ($isElevated) {
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType S4U -RunLevel Limited
    $principalNote = "S4U（ログオンの有無にかかわらず実行）"
} else {
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
    $principalNote = "Interactive（ログオン中のみ実行。ログオン前も走らせるなら管理者として実行して登録し直す）"
}
$tasks = @(
    @{ Name = "Anipolis daily sync";  Script = "daily-sync.ps1";  Trigger = (New-ScheduledTaskTrigger -Daily -At 05:15); Limit = (New-TimeSpan -Hours 1) },
    @{ Name = "Anipolis weekly sync"; Script = "weekly-sync.ps1"; Trigger = (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 04:15); Limit = (New-TimeSpan -Hours 2) }
)

foreach ($t in $tasks) {
    if ($Unregister) {
        if (Get-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $t.Name -Confirm:$false
            Write-Host "unregistered: $($t.Name)"
        }
        continue
    }
    $scriptPath = Join-Path $here $t.Script
    $action = New-ScheduledTaskAction -Execute $powershell `
        -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`"" `
        -WorkingDirectory (Split-Path -Parent (Split-Path -Parent $here))
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit $t.Limit `
        -MultipleInstances IgnoreNew -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
    Register-ScheduledTask -TaskName $t.Name -Action $action -Trigger $t.Trigger -Settings $settings -Principal $principal `
        -Description "Anipolis catalog sync (moved off GitHub Actions). Logs: .sync-logs/" -Force | Out-Null
    Write-Host "registered: $($t.Name) -> $scriptPath"
}

if (-not $Unregister) {
    Write-Host ""
    Write-Host ("実行アカウント: " + $userId + " / ログオン方式: " + $principalNote)
    Write-Host "手動実行で動作確認:"
    Write-Host "  Start-ScheduledTask -TaskName 'Anipolis daily sync'"
    Write-Host "  Get-Content .sync-logs\last-daily-sync.log -Tail 20"
}
