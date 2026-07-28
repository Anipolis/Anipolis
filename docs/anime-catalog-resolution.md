# アニメカタログ解決仕様

Anipolisの各インポーターは、表示用の `anime` を直接更新しない。取得・正規化した値を
`anime_source_records` へ保存し、専用resolverがフィールド単位の優先規則と出典を適用して
`anime` を再生成する。

## パイプライン

```text
anime-offline-database ─┐
Jikan ──────────────────┼─> anime_source_records ─> catalog resolver ─> anime
Wikidata ───────────────┤                              └─> anime_resolution_records
管理画面の手動編集 ─────┘
```

インポーターの実行順は解決結果に影響しない。管理画面でMAL ID付き作品を編集すると、DBトリガーが
編集結果を `source = manual` として保存する。resolverを再実行しても手動編集は最優先で維持される。

## フィールド優先規則

| フィールド | 優先順位 |
| --- | --- |
| 表示タイトル | manual → Wikidata日本語ラベル → Jikan日本語タイトル → legacy → ODbL |
| 英語タイトル | manual → Jikan英語タイトル → Wikidata英語ラベル → legacy |
| ローマ字 | manual → Jikan default → Wikidata別名で検証できたODbLタイトル → legacy → ODbL候補 |
| 話数・種別・状態・シーズン | manual → ODbL → Jikan → legacy |
| 放送日・放送時刻・公式URL | manual → Jikan → legacy |
| スタジオ | manual → Wikidata組織IDで同定したJikan既存名 → Wikidataラベル → legacy → ODbL候補 |

Jikanソースレコードにはスタジオ名だけでなく `studios[].mal_id` とURLも保存する。ODbLのスタジオ文字列は
同一性が確認できないため候補として扱い、Jikanの識別済みスタジオを上書きしない。

## 検証状態と公開判定

resolverは各作品を次の検証状態へ分類する。

- `verified`: manual、Wikidata、Jikanのいずれかで表示タイトルを確認できた
- `review`: 日本語表示タイトルは既存DBにあるが、ソース別の根拠がまだない
- `unverified`: 確認済み表示タイトルがない

`verified` の作品だけ `anime.metadata_ready = true` になり、一般カタログへ表示する。
`review` と `unverified` はソースレコードと解決結果を残したまま一般カタログから隠す。
管理者は監査・修正のためDB上では未公開作品も参照できるが、一般カタログの一覧・件数・ページングは
管理者ログイン中でも `metadata_ready = true` に限定する。
英字だけの正式日本語タイトルもWikidataまたはJikanの言語情報に基づいて検証できるため、文字種だけでは判定しない。

## スタジオ名

スタジオ名は固定の英日辞書だけに依存せず、`studio_source_records` の組織レコードと
`studio_name_aliases` の正規化別名を優先して解決する。Wikidataのアニメーションスタジオを取得し、英語ラベル・別名を
ODbL/Jikanの入力名と一意に照合できた場合だけ日本語名を採用する。同じ別名が複数組織に一致する場合は推測しない。
Wikidataの `name_ja` / `name_en` は出典ラベルとして保持し、表示には `canonical_name_ja` /
`canonical_name_en` を使う。同じ組織にJikan由来の既存名があればその表記を優先し、なければWikidataラベルを使う。
別名は最終文字列ではなくWikidata組織ID単位で集約するため、同一組織の複数表記を作品データへ重複保存しない。

```sh
pnpm import:wikidata-studios -- --year 2023 --season winter --dry-run
pnpm import:wikidata-studios -- --year 2023 --season winter
```

## 再現と監査

```sh
pnpm resolve:anime-catalog -- --year 2023 --season winter --dry-run
pnpm resolve:anime-catalog -- --year 2023 --season winter
```

`anime_resolution_records` は最新の解決値、フィールドごとの採用ソース、信頼度、検証状態と理由を保存する。
書き込み前には必ずドライランで変更件数と検証件数を確認する。
