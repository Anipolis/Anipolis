# 週次: 当季+次季のフルインポートとカタログ再解決、公開カタログの再生成。
# 旧ワークフローの "Weekly imports and resolve" と同じ順序・同じ失敗方針。毎週月曜 04:15 JST。
#   - Jikan / Wikidata の失敗は警告のみ（公開 Jikan は慢性的に 504。Wikidata は翌週に自然回復）
#   - MAL / しょぼい / resolve / export の失敗は同期不全なので終了コードを非 0 にする
#   - シーズン単位で失敗を隔離し、1 シーズン目が落ちても 2 シーズン目を実行する
#   - 権利表記（©）は前期・今期・次期だけ collect:copyright → import:annict → resolve:copyright-seasons
#     （失敗は警告のみ）
# それ以外の外部サイト巡回系（enrich:jikan-links / collect:official-x / collect:wayback）は含めない。必要時に手動で実行する。
. (Join-Path $PSScriptRoot "common.ps1")

Start-SyncLog -Name "weekly-sync"
$failed = 0
try {
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
    Stop-SyncLog -ExitCode $failed
}
exit $failed
