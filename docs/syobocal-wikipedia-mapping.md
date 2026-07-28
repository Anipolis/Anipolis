# しょぼいカレンダーのWikipedia連携

しょぼいカレンダーのタイトルデータに含まれる `Keywords` の
`wikipedia:キーワード` を、TIDとMAL IDを照合するための補助証拠として利用する。
`Comment` 内に直接記載された日本語Wikipediaリンクも同じ経路で検証する。

## 照合経路

```text
Syobocal TID
  -> wikipedia:キーワード
  -> 日本語Wikipedia（リダイレクト解決）
  -> Wikidata QID
  -> P4086（MyAnimeList ID）
```

次の条件をすべて満たす場合だけ `wikipedia_wikidata` として自動確定する。

1. 対象シーズン付近のしょぼいカレンダータイトルである。
2. 日本語Wikipedia APIでページとWikidata QIDを解決できる。
3. QIDのP4086が単一のMAL IDを示し、そのIDが対象カタログに存在する。
4. 一つのTIDから複数のMAL IDが得られず、一つのMAL IDから複数のTIDが得られない。

照合優先順位は、手動確認、WikidataのP4086とP11648による直接対応、
Wikipedia/Wikidata対応、正規化タイトル完全一致の順とする。

Wikipedia経由で同一性を確認できても、しょぼいカレンダーのタイトルと検証対象の
日本語タイトルが正規化完全一致しない場合は `use_for_title = false` とする。
したがって、Wikipedia対応だけを理由に英語タイトルなどを日本語表示タイトルとして公開しない。

検証済みWikipedia URLは、対応する `source = syobocal` の
`anime_source_records.normalized_data.resources` に保存する。Wikipedia本文やInfoboxは
取り込まず、作品同一性の照合と出典リンクだけに利用する。

## 運用

初回に `105_syobocal_wikipedia_mapping_method.sql` を適用する。その後は通常の
`import:syobocal` にWikipedia照合が含まれるため、インポートごとのマイグレーションは不要。

参照API:

- `https://cal.syoboi.jp/db.php` (`TitleLookup`)
- `https://ja.wikipedia.org/w/api.php` (`query`, `redirects`, `pageprops`)
- `https://query.wikidata.org/sparql` (P4086)
