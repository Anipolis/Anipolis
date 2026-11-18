# 週次: 当季+次季のフルインポートとカタログ再解決、公開カタログの再生成。
# 旧ワークフローの "Weekly imports and resolve" と同じ順序・同じ失敗方針。毎週月曜 04:15 JST。
#   - Jikan / Wikidata の失敗は警告のみ（公開 Jikan は 2026-10 から停止中。シーズンの作品一覧は MAL の記録でも決まる。
#     同じステップが 3 回続けて失敗したら一度だけ知らせる。Wikidata は翌週に自然回復）
#   - 失敗したら SYNC_ALERT_WEBHOOK_URL（Discord）へ知らせる（common.ps1 の Update-SyncStateAndAlert）
#   - MAL / しょぼい / resolve / export の失敗は同期不全なので終了コードを非 0 にする
#   - シーズン単位で失敗を隔離し、1 シーズン目が落ちても 2 シーズン目を実行する
#   - 権利表記（©）は前期・今期・次期だけ collect:copyright → import:annict → resolve:copyright-seasons
#     （失敗は警告のみ）
# それ以外の外部サイト巡回系（enrich:jikan-links / collect:official-x / collect:wayback）は含めない。必要時に手動で実行する。
. (Join-Path $PSScriptRoot "common.ps1")

# 手元の jikan-rest（Docker）。置き場所は JIKAN_REST_DIR で変えられる
$script:LocalJikanUrl = "http://localhost:8080/v4"
$script:JikanRestDir = if ($env:JIKAN_REST_DIR) { $env:JIKAN_REST_DIR } else { "D:\tmp\jikan-rest" }

function Test-LocalJikan {
    try {
        Invoke-WebRequest -Uri ($script:LocalJikanUrl + "/anime/1") -UseBasicParsing -TimeoutSec 10 | Out-Null
        return $true
    } catch {
        return $false
    }
}

# docker は警告（compose の version 属性など）も stderr に出す。common.ps1 の $ErrorActionPreference = "Stop" の
# ままだと、それが終了エラーになって週次全体が止まる（Invoke-Step と同じ理由）。下の関数では関数内だけ Continue にする
function Write-DockerOutput {
    process { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { $_ } }
}

function Test-DockerEngine {
    $ErrorActionPreference = "Continue"
    # エンジンが止まっているときの stderr はログに要らない
    & docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

# 動いていなければ Docker Desktop と jikan-rest を起動する。このスクリプトがコンテナを起動したときだけ $true
# （終わったらコンテナを止める。Docker Desktop 自体は止めない）
function Start-LocalJikan {
    $ErrorActionPreference = "Continue"
    if (Test-LocalJikan) { return $false }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "docker is not installed; skipping local jikan-rest"
        return $false
    }
    if (-not (Test-Path (Join-Path $script:JikanRestDir "docker-compose.yml"))) {
        Write-Host ("jikan-rest not found at " + $script:JikanRestDir)
        return $false
    }
    if (-not (Test-DockerEngine)) {
        $desktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
        if (-not (Test-Path $desktop)) {
            Write-Host "Docker Desktop is not installed; skipping local jikan-rest"
            return $false
        }
        Write-Host "Starting Docker Desktop"
        Start-Process -FilePath $desktop | Out-Null
        $deadline = (Get-Date).AddMinutes(5)
        while (-not (Test-DockerEngine)) {
            if ((Get-Date) -gt $deadline) {
                Write-Host "Docker engine did not start within 5 minutes"
                return $false
            }
            Start-Sleep -Seconds 5
        }
    }
    Write-Host "Starting local jikan-rest"
    & docker compose --project-directory $script:JikanRestDir up -d 2>&1 | Write-DockerOutput | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host ("docker compose up failed (exit " + $LASTEXITCODE + ")")
        return $false
    }
    # 一部だけ起動していることがあるので、ここから先は失敗しても止める対象にする
    $deadline = (Get-Date).AddMinutes(5)
    while (-not (Test-LocalJikan)) {
        if ((Get-Date) -gt $deadline) {
            Write-Host "Local jikan-rest did not respond within 5 minutes"
            return $true
        }
        Start-Sleep -Seconds 5
    }
    return $true
}

function Stop-LocalJikan {
    $ErrorActionPreference = "Continue"
    Write-Host "Stopping local jikan-rest"
    & docker compose --project-directory $script:JikanRestDir stop 2>&1 | Write-DockerOutput | Out-Host
}

Start-SyncLog -Name "weekly-sync"
$failed = 0
$startedJikan = $false
try {
    # 日次が動いていない場合にも気づけるよう、最終成功から 2 日を超えたら知らせる
    Test-StaleSync -Name "daily-sync" -MaxDays 2
    # 公開 Jikan は 2026-10 から落ちたまま（#595）。手元の jikan-rest（d:\tmp\jikan-rest、Docker）が
    # 動いていればそちらから取る。どちらも無ければ Jikan は失敗するが、シーズンの作品一覧は
    # MAL 公式 API の記録でも決まるので、カタログの更新は止まらない。
    # 動いていなければ Docker Desktop と jikan-rest をここで起動し、終わったらコンテナを止める（#595）
    if (-not $env:JIKAN_BASE_URL) {
        $startedJikan = Start-LocalJikan
        if (Test-LocalJikan) {
            $env:JIKAN_BASE_URL = $script:LocalJikanUrl
            Write-Host ("Using local jikan-rest at " + $script:LocalJikanUrl)
        } else {
            Write-Host "Local jikan-rest is not available; using public Jikan"
        }
    }
    foreach ($t in (Get-SeasonTargets)) {
        $tag = [string]$t.Year + "-" + $t.Season
        # $args は PowerShell の自動変数なので別名にする
        $seasonArgs = @("--", "--year", [string]$t.Year, "--season", $t.Season)
        Write-Host ("=== " + $tag + " ===")

        $code = Invoke-Step -Label ("import:jikan " + $tag) -PnpmArgs (@("import:jikan") + $seasonArgs)
        if ($code -ne 0) {
            Write-Host ("warning: Jikan import for " + $tag + " failed (public Jikan is expected to be flaky)")
        }
        $code = Invoke-Step -Label ("import:mal " + $tag) -PnpmArgs (@("import:mal") + $seasonArgs)
        if ($code -ne 0) {
            Write-Host ("MAL import for " + $tag + " failed; continuing")
            $failed = 1
        }
        # Wikidata はタイトル解決の最上位ソース群で、しょぼい照合の候補題にも使うため、しょぼいより前に更新
        $code = Invoke-Step -Label ("import:wikidata-titles " + $tag) -PnpmArgs (@("import:wikidata-titles") + $seasonArgs)
        if ($code -ne 0) {
            Write-Host ("warning: Wikidata title import for " + $tag + " failed; catalog falls back to MAL/Jikan titles until next week")
        }
        $code = Invoke-Step -Label ("import:wikidata-studios " + $tag) -PnpmArgs (@("import:wikidata-studios") + $seasonArgs)
        if ($code -ne 0) {
            Write-Host ("warning: Wikidata studio import for " + $tag + " failed; studio name localization deferred")
        }
        $code = Invoke-Step -Label ("import:syobocal " + $tag) -PnpmArgs (@("import:syobocal") + $seasonArgs)
        if ($code -eq 0) {
            $code = Invoke-Step -Label ("resolve:anime-catalog " + $tag) -PnpmArgs (@("resolve:anime-catalog") + $seasonArgs)
            if ($code -ne 0) {
                Write-Host ("Resolve for " + $tag + " failed")
                $failed = 1
            }
        } else {
            Write-Host ("Syobocal import for " + $tag + " failed; skipping resolve")
            $failed = 1
        }
    }
    # 権利表記（©）: 前期・今期・次期の空欄を埋め、決めきれないものは管理画面の「©確認」に積む。
    # 公式サイトの巡回は「公式サイトあり・© 空欄」の作品だけなので、埋まった作品は次週以降対象外。
    # 外部サイト・Annict は不安定なことがあるため、失敗は警告のみ（翌週に再試行される）。
    foreach ($tag in (Get-CopyrightSeasonTargets)) {
        Write-Host ("=== copyright " + $tag + " ===")
        $code = Invoke-Step -Label ("collect:copyright " + $tag) -PnpmArgs @("collect:copyright", "--", "--season", $tag, "--apply")
        if ($code -ne 0) {
            Write-Host ("warning: copyright collection for " + $tag + " failed")
        }
        $code = Invoke-Step -Label ("import:annict " + $tag) -PnpmArgs @("import:annict", "--", "--season", $tag, "--allow-shared")
        if ($code -ne 0) {
            Write-Host ("warning: Annict import for " + $tag + " failed (check ANNICT_ACCESS_TOKEN)")
        }
    }
    # 期の違いだけの © 候補は作品の期に合う表記で自動決定し、残りだけを人の確認に回す
    $code = Invoke-Step -Label "resolve:copyright-seasons" -PnpmArgs @("resolve:copyright-seasons")
    if ($code -ne 0) {
        Write-Host "warning: season-based copyright resolution failed"
    }

    # ODbL 公開カタログの静的成果物。上流が失敗していても既存レコードからの再生成は安全なので常に試みる
    $code = Invoke-Step -Label "export:anime-catalog" -PnpmArgs @("export:anime-catalog")
    if ($code -ne 0) {
        Write-Host "Catalog export failed"
        $failed = 1
    }
} catch {
    Write-Host ("!!! unhandled: " + $_.Exception.Message)
    $failed = 1
} finally {
    if ($startedJikan) { Stop-LocalJikan }
    Stop-SyncLog -ExitCode $failed
}
exit $failed
