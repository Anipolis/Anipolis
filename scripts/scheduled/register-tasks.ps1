# Windows タスクスケジューラに日次・週次の同期を登録する（開発機で 1 回実行）。
#   powershell -ExecutionPolicy Bypass -File scripts/scheduled/register-tasks.ps1
# 解除: powershell -ExecutionPolicy Bypass -File scripts/scheduled/register-tasks.ps1 -Unregister
# 旧 GitHub Actions のスケジュール（日次 05:15 JST / 週次 月曜 04:15 JST）をそのまま引き継ぐ。
# PC がその時刻に起動していなかった場合は、次に起動したときに実行する（StartWhenAvailable）。
param([switch]$Unregister)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$powershell = (Get-Command powershell.exe).Source
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
    Register-ScheduledTask -TaskName $t.Name -Action $action -Trigger $t.Trigger -Settings $settings `
        -Description "Anipolis catalog sync (moved off GitHub Actions). Logs: .sync-logs/" -Force | Out-Null
    Write-Host "registered: $($t.Name) -> $scriptPath"
}

if (-not $Unregister) {
    Write-Host ""
    Write-Host "手動実行で動作確認:"
    Write-Host "  Start-ScheduledTask -TaskName 'Anipolis daily sync'"
    Write-Host "  Get-Content .sync-logs\last-daily-sync.log -Tail 20"
}
