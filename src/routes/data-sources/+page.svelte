<script lang="ts">
import {
	ANIME_OFFLINE_DBCL_URL,
	ANIME_OFFLINE_ODBL_URL,
	ANIME_OFFLINE_REPOSITORY_URL,
	ANIPOLIS_TRANSFORMATION_URL,
} from "$lib/anime-offline-database";
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
			Anipolisでは、作品データの一部に <a href={ANIME_OFFLINE_REPOSITORY_URL}>anime-offline-database</a>
			を利用しています。対象作品には作品ページ上でも出典を表示します。
		</p>
	</header>

	<section>
		<h2>ライセンス</h2>
		<p>
			データベースは <a href={ANIME_OFFLINE_ODBL_URL}>Open Database License 1.0（ODbL）</a>、
			データベース内の個々の内容は <a href={ANIME_OFFLINE_DBCL_URL}>Database Contents License 1.0（DbCL）</a>
			に基づきます。
		</p>
		<p>
			Anipolisが公開利用している派生データは、機械可読な
			<a href="/api/data/anime-catalog">アニメ作品カタログAPI</a>から取得できます。
		</p>
	</section>

	<section>
		<h2>取り込む項目と変換</h2>
		<ul>
			<li>MyAnimeListの作品URLからMAL IDを抽出し、作品の照合キーとして使用します。</li>
			<li>タイトル、話数、種別、公開状況、シーズン、制作スタジオをAnipolisの形式へ変換します。</li>
			<li>既存作品では登録済みの値を優先し、不足項目とシーズン、出典を補完します。</li>
			<li>上流のタグはAnipolisのジャンル分類と意味が異なるため、自動取り込みしません。</li>
			<li>関連作品は関係種別を判別できないため、自動取り込みしません。</li>
			<li>画像の権利はデータベースライセンスとは別なので、画像URLや画像自体は取り込みません。</li>
		</ul>
	</section>

	<section>
		<h2>再現可能性</h2>
		<p>
			各作品には、取り込みに使用した固定リリースのJSON URLを保存します。変換処理の全体は
			<a href={ANIPOLIS_TRANSFORMATION_URL}>公開インポータースクリプト</a>で確認できます。
		</p>
		<pre><code>pnpm import:anime-offline -- --year 2023 --season winter --dry-run</code></pre>
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
