# anime-offline-database 取り込み仕様

Anipolisの作品カタログの一部は、`manami-project/anime-offline-database` を変換して利用する。
上流データベースは ODbL 1.0、個々のデータベース内容は DbCL 1.0 で提供される。

## 入力の固定

インポーターの既定入力は GitHub Releases の `latest` アセットである。HTTPリダイレクト後の固定タグ付きURLを、各作品の `resources` に次の形式で保存する。

```json
{
  "name": "anime-offline-database",
  "url": "https://github.com/manami-project/anime-offline-database/releases/download/<release>/anime-offline-database-minified.json"
}
```

このURLによって使用した入力を作品単位で特定する。再実行時は同名リソースを新しい固定URLに置換する。

変換結果は `anime_source_records` に `source = anime_offline_database` として保存する。インポーターは表示用の `anime` を直接更新しない。専用resolverがODbLデータを基礎に、Wikidata、Jikan、手動データをフィールド単位で解決する。Jikanの正規化結果も同じテーブルへ保存するが、公開ポリシーでは取得できない。

## 変換規則

| 上流 | Anipolis | 規則 |
| --- | --- | --- |
| `sources` | `mal_id` | `myanimelist.net/anime/<id>` の数値IDを抽出 |
| `title` | ソース別の `title` | 言語区分がないため言語別タイトルへ断定的に割り当てない |
| `synonyms` | `title_ja_candidates` | 仮名を含む値だけを未検証候補として保存。表示タイトルには自動適用しない |
| `episodes` | `episode_count` | 1以上の整数を文字列化。不明値は `null` |
| `type` | `type` | TV / MOVIE / OVA / ONA / SPECIAL を既存表記へ変換 |
| `status` | `status` | FINISHED / ONGOING / UPCOMING を finished / airing / upcoming へ変換 |
| `animeSeason` | `season` | `<year>-<lowercase season>` |
| `studios` | ソース別の `studios` | 重複と空文字列を除去。大小文字・別名を含むため表示値はJikan・手動データで補完 |

`episode_count`、`type`、`status`、`season`はODbLの値を基礎とする。ODbLのタイトルは言語区分がなく、スタジオは小文字・別名を含むため、新規作品のフォールバックにだけ使う。日本語・ローマ字・英語タイトルと表示用スタジオ名は既存値、Wikidata、Jikanまたは手動データで補完する。Jikanはさらに放送期間、原作種別、ジャンル、放送枠、公式リンクなどODbLにない項目を補完する。

### 日本語タイトルの補完

日本語タイトルは次の優先順位で扱う。

1. 手動編集を含む既存の確定済み表示タイトル
2. MyAnimeList anime ID（WikidataのP4086）で照合した、言語タグ `ja` の単一ラベル
3. Jikanの日本語タイトル
4. anime-offline-databaseの `synonyms` にある仮名を含む未検証候補
5. anime-offline-databaseの既定タイトル

Wikidataの構造化データはCC0であり、正規化結果を `anime_source_records` の `source = wikidata` として出典URL付きで保存する。同じMAL IDに異なる日本語ラベルが複数ある場合は候補だけを保存し、自動適用しない。既存タイトルを上書きするのは、表示タイトルがODbLのフォールバック値と完全一致し、まだ日本語文字を含まない場合だけである。

`tags` はAnipolisのジャンル体系と一致しないため除外する。`relatedAnime` は関係種別を特定できないため除外する。`picture` と `thumbnail` は画像の権利がデータベースライセンスに含まれるとは限らないため除外する。

### 2023年冬データの形式確認

固定リリース `2026-27` の2023年冬データをドライランした結果、季節一致408件のうちMAL ID付き306件を正規化できた。正規化対象のタイトルは306件すべて日本語文字を含まず、ローマ字と英訳が混在していた。スタジオ267値はすべて小文字だった。`synonyms` からは196件で仮名を含む候補を得られたが、そのうち104件は候補が複数あり、日本語タイトルだと一意に断定できない。この結果に基づき、既定タイトルの言語を推測せず `title_language: null` として保存し、候補も未検証であることを明示する。

同じ306件をWikidataで照合すると、日本語ラベルを57件で取得でき、ラベル衝突は0件だった。既存タイトルを保護する適用条件では、そのうち44件が新たな表示タイトルの補完対象になった（2026年7月28日時点）。

## 実行

```sh
pnpm import:anime-offline -- --year 2023 --season winter --dry-run
pnpm import:anime-offline -- --year 2023 --season winter
pnpm import:wikidata-titles -- --year 2023 --season winter --dry-run
pnpm import:wikidata-titles -- --year 2023 --season winter
pnpm import:wikidata-studios -- --year 2023 --season winter --dry-run
pnpm import:wikidata-studios -- --year 2023 --season winter
pnpm resolve:anime-catalog -- --year 2023 --season winter --dry-run
pnpm resolve:anime-catalog -- --year 2023 --season winter
```

別の固定入力を再現する場合は `--dataset-url` を指定する。本番書き込みには `PUBLIC_SUPABASE_URL` と `SUPABASE_SECRET_KEY`（または従来の同等環境変数）が必要である。公開用の publishable key では書き込みを行わない。

## 公開

- Web上の説明: `/data-sources`
- ODbL由来の派生作品データ: `/api/data/anime-catalog`
- 作品単位の表示: 各作品詳細ページ最下部の「データ出典」欄

公開APIは `anime_source_records` のODbL正規化データから直接生成する。統合後の `anime` から逆算しないため、Jikan・手動データがODbLデータとして混入したり、既存値の優先によってODbL変換結果が欠落したりしない。APIはこれがAnipolis全作品カタログではないことと、除外したソースを明示する。
