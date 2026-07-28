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

## 変換規則

| 上流 | Anipolis | 規則 |
| --- | --- | --- |
| `sources` | `mal_id` | `myanimelist.net/anime/<id>` の数値IDを抽出 |
| `title` | `title`, `title_romaji` | 文字列をそのまま使用 |
| `episodes` | `episode_count` | 1以上の整数を文字列化。不明値は `null` |
| `type` | `type` | TV / MOVIE / OVA / ONA / SPECIAL を既存表記へ変換 |
| `status` | `status` | FINISHED / ONGOING / UPCOMING を finished / airing / upcoming へ変換 |
| `animeSeason` | `season` | `<year>-<lowercase season>` |
| `studios` | `studio`, `studio_en` | 重複と空文字列を除去 |

既存作品は現在のタイトル・話数・種別・公開状況・スタジオを優先する。インポーターはシーズンと出典を更新し、空の項目だけを補完する。

`tags` はAnipolisのジャンル体系と一致しないため除外する。`relatedAnime` は関係種別を特定できないため除外する。`picture` と `thumbnail` は画像の権利がデータベースライセンスに含まれるとは限らないため除外する。

## 実行

```sh
pnpm import:anime-offline -- --year 2023 --season winter --dry-run
pnpm import:anime-offline -- --year 2023 --season winter
```

別の固定入力を再現する場合は `--dataset-url` を指定する。本番書き込みには `PUBLIC_SUPABASE_URL` と `SUPABASE_SECRET_KEY`（または従来の同等環境変数）が必要である。公開用の publishable key では書き込みを行わない。

## 公開

- Web上の説明: `/data-sources`
- ODbL由来の派生作品データ: `/api/data/anime-catalog`
- 作品単位の表示: 各作品詳細ページの「作品メタデータ」欄

公開APIは作品カタログだけを返し、ユーザーデータ、投稿、画像を含めない。
