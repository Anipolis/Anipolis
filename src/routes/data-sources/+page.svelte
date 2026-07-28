<script lang="ts">
import {
	ANIME_OFFLINE_DBCL_URL,
	ANIME_OFFLINE_ODBL_URL,
	ANIME_OFFLINE_REPOSITORY_URL,
	ANIPOLIS_TRANSFORMATION_URL,
} from "$lib/anime-offline-database";
import {
	WIKIDATA_CC0_URL,
	WIKIDATA_PROPERTY_MAL_ANIME_ID_URL,
	WIKIDATA_TRANSFORMATION_URL,
} from "$lib/wikidata-anime-titles";
import {
	WIKIDATA_ANIMATION_STUDIO_URL,
	WIKIDATA_MAL_COMPANY_PROPERTY_URL,
	WIKIDATA_STUDIO_TRANSFORMATION_URL,
} from "$lib/wikidata-studio-names";
</script>

<svelte:head>
	<title>データ出典 | Anipolis</title>
	<meta name="description" content="Anipolisの作品メタデータの出典、ライセンス、変換手順">
</svelte:head>

<main class="data-sources-page">
	<header>
		<p class="eyebrow">DATA SOURCES</p>
		<h1>作品データの出典</h1>
		<p class="lead">
			Anipolisでは、作品ごとに実際に利用したデータ出典を作品ページの最下部に表示します。作品を閲覧するための外部リンクと、データ作成の出典は分けて扱います。
		</p>
	</header>

	<section>
		<h2>表示上の区分</h2>
		<ul>
			<li>
				「公式リンク」は公式サイトと公式X、「リソース」はMALと検証済みWikipediaなど、作品を閲覧するためのリンクです。
			</li>
			<li>ページ最下部の「データ出典」は、表示データの作成に実際に利用したソースだけを示します。</li>
			<li>
				照合方法、信頼度、生データ、取り込み日時などの監査情報は管理用として保持し、作品ページでは公開しません。
			</li>
		</ul>
	</section>

	<section>
		<h2>ライセンスと利用範囲</h2>
		<p>
			作品カタログの基礎には <a href={ANIME_OFFLINE_REPOSITORY_URL}>anime-offline-database</a>
			を利用しています。データベースは <a href={ANIME_OFFLINE_ODBL_URL}>Open Database License 1.0（ODbL）</a>、
			データベース内の個々の内容は <a href={ANIME_OFFLINE_DBCL_URL}>Database Contents License 1.0（DbCL）</a>
			に基づきます。
		</p>
		<p>
			anime-offline-databaseから変換した完全な派生データは、機械可読な
			<a href="/api/data/anime-catalog">アニメ作品カタログAPI</a>から取得できます。
			このAPIはJikanや手動編集を含むAnipolis全作品データの配布ではありません。
		</p>
		<p>
			日本語タイトルの補完には、<a href={WIKIDATA_PROPERTY_MAL_ANIME_ID_URL}>MyAnimeList anime ID（P4086）</a>
			で作品を照合したWikidataの日本語ラベルも利用します。Wikidataの構造化データは
			<a href={WIKIDATA_CC0_URL}>CC0</a>で提供されています。
		</p>
		<p>
			スタジオ名はWikidataの<a href={WIKIDATA_ANIMATION_STUDIO_URL}>アニメーションスタジオ</a>項目と
			<a href={WIKIDATA_MAL_COMPANY_PROPERTY_URL}>MyAnimeList company ID（P11490）</a>を組織の識別に利用します。
		</p>
		<p>
			不足項目の補完と照合にはJikan
			APIとしょぼいカレンダーを利用します。これらの生データはODbL派生カタログAPIへ混在させず、作品ページにも内部スナップショットや照合証拠を公開しません。
		</p>
	</section>

	<section>
		<h2>取り込む項目と変換</h2>
		<ul>
			<li>MyAnimeListの作品URLからMAL IDを抽出し、作品の照合キーとして使用します。</li>
			<li>タイトル、話数、種別、公開状況、シーズン、制作スタジオをソース別レコードへ保存します。</li>
			<li>話数・種別・公開状況・シーズンなど同等の項目は、このODbLデータを表示用データの基礎にします。</li>
			<li>
				タイトルには言語区分がないため、synonyms内の仮名を含む値は未検証候補として保存し、自動適用しません。
			</li>
			<li>
				日本語表示名は既存値を維持し、未補完のODbLタイトルだけWikidataの単一日本語ラベルで安全に補完します。
			</li>
			<li>スタジオはWikidataの英語ラベル・別名と一意に一致した組織だけ、日本語名と正規英語名へ変換します。</li>
			<li>上流のタグはAnipolisのジャンル分類と意味が異なるため、自動取り込みしません。</li>
			<li>関連作品は関係種別を判別できないため、自動取り込みしません。</li>
			<li>画像の権利はデータベースライセンスとは別なので、画像URLや画像自体は取り込みません。</li>
		</ul>
	</section>

	<section>
		<h2>再現可能性</h2>
		<p>
			ソース別レコードには、取り込みに使用した固定リリース、更新日、正規化結果を保存します。変換処理の全体は
			<a href={ANIPOLIS_TRANSFORMATION_URL}>ODbLインポーター</a>と
			<a href={WIKIDATA_TRANSFORMATION_URL}>Wikidataタイトルインポーター</a>、
			<a href={WIKIDATA_STUDIO_TRANSFORMATION_URL}>Wikidataスタジオインポーター</a>で確認できます。
		</p>
		<pre><code>pnpm import:anime-offline -- --year 2023 --season winter --dry-run
pnpm import:wikidata-titles -- --year 2023 --season winter --dry-run
pnpm import:wikidata-studios -- --year 2023 --season winter --dry-run
pnpm resolve:anime-catalog -- --year 2023 --season winter --dry-run</code></pre>
		<p>
			各インポーターは表示用データを直接更新しません。すべてのソースを保存した後、resolverが項目ごとの優先順位と出典を適用し、検証済みの作品だけを一般カタログへ表示します。未検証作品もソースレコードと監査結果は保持します。
		</p>
	</section>

	<section>
		<h2>MyAnimeListリンクについて</h2>
		<p>
			作品ページの「MAL」リンクは作品を参照するための外部リンクです。データセットの出典表示とは分けて表示しています。
		</p>
	</section>
</main>

<style>
.data-sources-page {
	width: min(760px, calc(100% - 32px));
	margin: 0 auto;
	padding: 48px 0 80px;
	color: var(--text);
}
header,
section {
	padding: 24px 0;
	border-bottom: 1px solid var(--border);
}
.eyebrow {
	margin: 0 0 8px;
	color: var(--accent);
	font-size: 0.75rem;
	font-weight: 700;
	letter-spacing: 0.12em;
}
h1,
h2 {
	margin: 0 0 16px;
}
h1 {
	font-size: clamp(1.8rem, 5vw, 2.5rem);
}
h2 {
	font-size: 1.15rem;
}
p,
li {
	line-height: 1.8;
}
.lead {
	color: var(--text-muted);
	font-size: 1.02rem;
}
a {
	color: var(--accent);
}
ul {
	margin: 0;
	padding-left: 1.25rem;
}
li + li {
	margin-top: 8px;
}
pre {
	overflow-x: auto;
	margin: 16px 0 0;
	padding: 14px 16px;
	border: 1px solid var(--border);
	border-radius: 8px;
	background: var(--hover-bg);
}
</style>
