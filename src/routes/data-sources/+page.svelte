<script lang="ts">
import {
	ANIME_OFFLINE_DBCL_URL,
	ANIME_OFFLINE_ODBL_URL,
	ANIME_OFFLINE_REPOSITORY_URL,
	ANIPOLIS_TRANSFORMATION_URL,
} from "$lib/anime-offline-database";
import { WIKIDATA_CC0_URL, WIKIDATA_TRANSFORMATION_URL } from "$lib/wikidata-anime-titles";
import { WIKIDATA_STUDIO_TRANSFORMATION_URL } from "$lib/wikidata-studio-names";
</script>

<svelte:head>
	<title>出典・権利 | Anipolis</title>
	<meta name="description" content="Anipolisの作品情報の出典、ライセンス、画像と権利表記、権利者の方への窓口">
</svelte:head>

<main class="data-sources-page">
	<header>
		<p class="eyebrow">SOURCES &amp; RIGHTS</p>
		<h1>出典・権利</h1>
		<p class="lead">
			Anipolisが表示する作品情報の参照元と、画像・権利表記の扱い、権利者の方へのご案内をまとめています。
		</p>
	</header>

	<section>
		<h2>作品情報の参照元</h2>
		<p>作品のタイトル、放送情報、話数、制作会社などは、次のデータをもとに作成しています。</p>
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">参照元</th>
						<th scope="col">ライセンス</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<a href={ANIME_OFFLINE_REPOSITORY_URL} target="_blank" rel="noopener noreferrer"
								>anime-offline-database</a
							>
						</td>
						<td>
							<a href={ANIME_OFFLINE_ODBL_URL} target="_blank" rel="noopener noreferrer">ODbL 1.0</a>
							/
							<a href={ANIME_OFFLINE_DBCL_URL} target="_blank" rel="noopener noreferrer">DbCL 1.0</a>
						</td>
					</tr>
					<tr>
						<td>
							<a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">Wikidata</a>
						</td>
						<td><a href={WIKIDATA_CC0_URL} target="_blank" rel="noopener noreferrer">CC0 1.0</a></td>
					</tr>
					<tr>
						<td>
							<a href="https://myanimelist.net/" target="_blank" rel="noopener noreferrer">MyAnimeList</a>
						</td>
						<td>—</td>
					</tr>
					<tr>
						<td><a href="https://jikan.moe/" target="_blank" rel="noopener noreferrer">Jikan API</a></td>
						<td>—</td>
					</tr>
					<tr>
						<td>
							<a href="https://cal.syoboi.jp/" target="_blank" rel="noopener noreferrer"
								>しょぼいカレンダー</a
							>
						</td>
						<td>—</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p>
			作品情報は自動処理と運営の確認で作成していますが、正確性・最新性を保証するものではありません。誤りを見つけた場合は、<a
				href="/contact"
				>お問い合わせ</a
			>からお知らせください。
		</p>
	</section>

	<section>
		<h2>画像と権利表記</h2>
		<ul>
			<li>作品ページの画像と「©」で始まる権利表記は、作品を識別する目的で表示しています。</li>
			<li>作品の画像・名称・権利表記に関する権利は、制作会社・製作委員会などの各権利者に帰属します。</li>
		</ul>
	</section>

	<section>
		<h2>外部リンク</h2>
		<p>
			作品ページの「公式リンク」は公式サイトと公式X、「リソース」はMyAnimeList・しょぼいカレンダー・Wikipediaの作品ページへのリンクです。リンク先の内容は各サイトの運営者が管理しており、Anipolisは責任を負いません。
		</p>
	</section>

	<section>
		<h2>権利者の方へ</h2>
		<p>
			作品情報・画像・権利表記の修正や削除をご希望の場合は、対象のページURLと具体的な内容を添えて、以下の窓口までご連絡ください。内容を確認のうえ、速やかに対応します。
		</p>
		<p class="contact">contact@anipolis.net（<a href="/contact">お問い合わせ</a>）</p>
	</section>

	<section>
		<details>
			<summary>データの変換について（技術情報）</summary>
			<p>
				anime-offline-databaseから変換した派生データは、機械可読な
				<a href="/api/data/anime-catalog"
					>アニメ作品カタログAPI</a
				>から取得できます。このAPIはJikanや手動編集を含むAnipolis全作品データの配布ではありません。
			</p>
			<p>
				変換処理は
				<a href={ANIPOLIS_TRANSFORMATION_URL} target="_blank" rel="noopener noreferrer">ODbLインポーター</a>、
				<a href={WIKIDATA_TRANSFORMATION_URL} target="_blank" rel="noopener noreferrer"
					>Wikidataタイトルインポーター</a
				>、
				<a href={WIKIDATA_STUDIO_TRANSFORMATION_URL} target="_blank" rel="noopener noreferrer"
					>Wikidataスタジオインポーター</a
				>
				で公開しています。取り込み時の固定リリース・更新日・正規化結果はソース別に保存し、表示用データは検証済みの作品だけに反映します。
			</p>
		</details>
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
table {
	width: 100%;
	border-collapse: collapse;
	margin: 0 0 16px;
	font-size: 0.92rem;
}
.table-scroll {
	overflow-x: auto;
}
th,
td {
	border: 1px solid var(--border);
	padding: 8px 12px;
	text-align: left;
	vertical-align: top;
	line-height: 1.6;
}
th {
	background: var(--hover-bg);
	white-space: nowrap;
}
.contact {
	font-weight: 600;
}
details summary {
	cursor: pointer;
	font-weight: 700;
}
details p {
	margin-top: 12px;
}
</style>
