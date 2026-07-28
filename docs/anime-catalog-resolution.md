# アニメカタログ解決仕様

Anipolisの各インポーターは、表示用の `anime` を直接更新しない。取得・正規化した値を
`anime_source_records` へ保存し、専用resolverがフィールド単位の優先規則と出典を適用して
`anime` を再生成する。

## パイプライン

```text
anime-offline-database ─┐
Jikan ──────────────────┼─> anime_source_records ─> catalog resolver ─> anime
Wikidata ───────────────┤                              └─> anime_resolution_records
しょぼいカレンダー ─────┤
管理画面の手動編集 ─────┘
```

各シーズンの解決対象は、同じシーズン値を持つanime-offline-databaseとJikanのMAL IDの和集合とする。
そのため、ODbLダンプにまだ存在しない作品もJikanレコードがあれば解決・公開判定の対象になる。
インポーターの実行順は、保存済みのソースレコードから得られる解決結果に影響しない。管理画面でMAL ID付き作品を
編集すると、DBトリガーが編集結果を `source = manual` として保存する。resolverを再実行しても手動編集は最優先で維持される。

## フィールド優先規則

| フィールド | 優先順位 |
| --- | --- |
| 表示タイトル | manual → 対応確認済みのしょぼいカレンダー → Wikidata日本語ラベル → Jikan日本語タイトル → legacy → ODbL |
| 英語タイトル | manual → Jikan英語タイトル → Wikidata英語ラベル → legacy |
| ローマ字 | manual → Jikan default → Wikidata別名で検証できたODbLタイトル → legacy → ODbL候補 |
| 話数・種別・状態・シーズン | manual → ODbL → Jikan → legacy |
| 公式URL | manual → しょぼいカレンダー → Jikan → legacy |
| 放送日・放送時刻 | `syobocal_programs` の絶対日時を表示用に利用。従来フィールドはmanual → Jikan → legacy |
| スタジオ | manual → Wikidata組織IDで同定したJikan既存名 → Wikidataラベル → legacy → ODbL候補 |

Jikanソースレコードにはスタジオ名だけでなく `studios[].mal_id` とURLも保存する。ODbLのスタジオ文字列は
同一性が確認できないため候補として扱い、Jikanの識別済みスタジオを上書きしない。

## 検証状態と公開判定

resolverは各作品を次の検証状態へ分類する。

- `verified`: manual、対応確認済みのしょぼいカレンダー、Wikidata、Jikanのいずれかで表示タイトルを確認できた
- `review`: 日本語表示タイトルは既存DBにあるが、ソース別の根拠がまだない
- `unverified`: 確認済み表示タイトルがない

`verified` の作品だけ `anime.metadata_ready = true` になり、一般カタログへ表示する。
`review` と `unverified` はソースレコードと解決結果を残したまま一般カタログから隠す。
管理者は監査・修正のためDB上では未公開作品も参照できるが、一般カタログの一覧・件数・ページングは
管理者ログイン中でも `metadata_ready = true` に限定する。
英字だけの正式日本語タイトルもWikidataまたはJikanの言語情報に基づいて検証できるため、文字種だけでは判定しない。

## しょぼいカレンダー

しょぼいカレンダーはMAL IDを直接持たないため、`anime_external_mappings` でMAL IDとTIDの対応を監査可能な形で管理する。
照合は次の順で採用し、上位の結果を下位の自動照合で上書きしない。

1. `scripts/data/syobocal-manual-mappings.json` の手動確認済み対応
2. WikidataでP4086（MAL ID）とP11648（しょぼいカレンダーTID）がともに単一の項目
3. 検証済み日本語タイトルのNFKC正規化完全一致かつ初回年月が1か月以内で、双方から一意になる対応

曖昧な対応は推測せず未解決一覧へ出す。Wikidata対応だけでは、分割クールなどで一つのTIDが複数のMAL作品を表す場合が
あるため、しょぼいカレンダーのタイトルを表示タイトルに使うのは既存の検証済みタイトルとも完全一致する場合に限る。
各実行の照合結果は `.syobocal-import-cache/reviews/<year>-<season>.json` に出力する。未解決を目視確認した場合は、
DBを直接編集せず次の形式で手動対応ファイルへ追加する。

```json
[
  {
    "mal_id": 12345,
    "tid": 6789,
    "use_for_title": true,
    "note": "公式タイトルと初回放送時期を目視確認"
  }
]
```

タイトル、チャンネル、放送枠はそれぞれ `syobocal_titles`、`syobocal_channels`、`syobocal_programs` に生値付きで保存する。
放送枠は作品一行へ集約せずPID・チャンネル単位で保持し、開始・終了日時は日本時間付きの絶対日時へ変換する。
これらと `source = syobocal` のレコードは内部表示用であり、ODbL派生データAPIには含めない。

```sh
pnpm import:syobocal -- --year 2023 --season winter --dry-run
pnpm import:syobocal -- --year 2023 --season winter
pnpm resolve:anime-catalog -- --year 2023 --season winter --dry-run
pnpm resolve:anime-catalog -- --year 2023 --season winter
```

マイグレーションは初回に `103_syobocal_catalog_and_programs.sql` を一度だけ適用する。シーズンを取り込むたびに
マイグレーションを再適用する必要はない。XML取得に失敗した場合は直近のローカルスナップショットを利用するが、
キャッシュもない場合は停止し、不完全なレスポンスを保存しない。

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
