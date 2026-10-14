<script lang="ts">
import { enhance } from "$app/forms";
import { COPYRIGHT_REVIEW_KIND_LABELS, COPYRIGHT_REVIEW_KINDS } from "$lib/copyright-reviews";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const kindInfo = $derived(COPYRIGHT_REVIEW_KIND_LABELS[data.kind]);
const totalPending = $derived(COPYRIGHT_REVIEW_KINDS.reduce((sum, kind) => sum + data.counts[kind], 0));
const approvableIds = $derived(data.items.filter((item) => item.anime.copyright !== null).map((item) => item.id));

const sourceLabels = { official_site: "公式サイト", annict: "Annict" } as const;

function pageHref(page: number) {
	return `?kind=${data.kind}&page=${page}`;
}

// 手入力欄に触れたら「手入力」を選択状態にする
function selectCustom(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const radio = input.form?.querySelector<HTMLInputElement>('input[name="choice"][value="custom"]');
	if (radio) radio.checked = true;
}
</script>

<svelte:head><title>©確認 - Admin</title></svelte:head>

<main class="list-page">
	<header class="page-header">
		<a href="/admin" class="back-link">← ダッシュボード</a>
		<div class="page-title">
			<p class="kicker">Admin</p>
			<h1>©確認 <span class="count-badge">{totalPending}</span></h1>
		</div>
		<p class="page-lead">
			取り込みで自動的に決められなかった権利表記です。© が無い作品はカバー画像が表示されません。
		</p>
	</header>

	<nav class="kind-tabs" aria-label="確認の種類">
		{#each COPYRIGHT_REVIEW_KINDS as kind}
			<a
				href="?kind={kind}"
				class="kind-tab"
				class:active={kind === data.kind}
				aria-current={kind === data.kind ? "page" : undefined}
			>
				{COPYRIGHT_REVIEW_KIND_LABELS[kind].label}
				<span class="kind-count">{data.counts[kind]}</span>
			</a>
		{/each}
	</nav>

	<p class="kind-description">{kindInfo.description}</p>

	{#if form?.message}
		<p class="form-message" role="alert">{form.message}</p>
	{/if}

	{#if data.items.length === 0}
		<p class="empty">確認待ちはありません。</p>
	{:else}
		{#if approvableIds.length > 0}
			<form method="POST" action="?/approveAsIs" use:enhance class="bulk-form">
				{#each approvableIds as id}
					<input type="hidden" name="review_id" value={id}>
				{/each}
				<button type="submit" class="btn btn-secondary">
					このページの{approvableIds.length}件を現在の©のまま承認
				</button>
			</form>
		{/if}

		<ul class="review-list">
			{#each data.items as item (item.id)}
				<li class="review-item">
					<div class="cover">
						{#if item.anime.cover_source_url}
							<img src={item.anime.cover_source_url} alt="" loading="lazy">
						{/if}
					</div>
					<div class="review-body">
						<div class="anime-line">
							<a href="/anime/{item.anime.id}" target="_blank" rel="noopener" class="anime-title"
								>{item.anime.title}</a
							>
							{#if item.anime.season}
								<span class="meta">{item.anime.season}</span>
							{/if}
							{#if item.anime.official_site_url}
								<a
									href={item.anime.official_site_url}
									target="_blank"
									rel="noopener noreferrer"
									class="meta-link"
									>公式サイト ↗</a
								>
							{/if}
						</div>
						{#if item.note}
							<p class="note">{item.note}</p>
						{/if}

						<form method="POST" action="?/resolve" use:enhance class="choice-form">
							<input type="hidden" name="review_id" value={item.id}>
							{#if item.anime.copyright !== null}
								<label class="choice">
									<input type="radio" name="choice" value="keep" checked>
									<span class="choice-source">現在</span>
									<span class="choice-text">{item.anime.copyright}</span>
								</label>
							{/if}
							{#each item.candidates as candidate, index}
								{#if candidate.text !== item.anime.copyright}
									<label class="choice">
										<input
											type="radio"
											name="choice"
											value="candidate:{index}"
											checked={item.anime.copyright === null && index === 0}
										>
										<span class="choice-source">{sourceLabels[candidate.source]}</span>
										<span class="choice-text">{candidate.text}</span>
									</label>
								{/if}
							{/each}
							<label class="choice">
								<input type="radio" name="choice" value="custom">
								<span class="choice-source">手入力</span>
								<input
									type="text"
									name="custom_text"
									class="custom-input"
									maxlength="300"
									placeholder="©…"
									onfocus={selectCustom}
								>
							</label>
							<label class="choice">
								<input type="radio" name="choice" value="clear">
								<span class="choice-source">©なし</span>
								<span class="choice-text muted"
									>©を空にする（画像も非表示、以後の自動取り込みで埋めない）</span
								>
							</label>
							<div class="choice-actions">
								<button type="submit" class="btn btn-primary">決定</button>
							</div>
						</form>
					</div>
				</li>
			{/each}
		</ul>

		{#if data.lastPage > 1}
			<nav class="pager" aria-label="ページ">
				{#if data.page > 1}
					<a href={pageHref(data.page - 1)} class="btn btn-ghost">← 前へ</a>
				{/if}
				<span class="pager-status">{data.page} / {data.lastPage}</span>
				{#if data.page < data.lastPage}
					<a href={pageHref(data.page + 1)} class="btn btn-ghost">次へ →</a>
				{/if}
			</nav>
		{/if}
	{/if}
</main>

<style>
.list-page {
	width: min(1040px, calc(100% - 32px));
	margin: 0 auto;
	padding: calc(var(--nav-height) + 24px) 0 48px;
}

.page-header {
	margin-bottom: 16px;
}

.back-link {
	display: inline-block;
	margin-bottom: 10px;
	color: var(--color-text-muted);
	font-size: 13px;
	text-decoration: none;
}

.back-link:hover {
	color: var(--color-text);
}

.kicker {
	margin: 0 0 2px;
	color: var(--color-accent);
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
}

.page-title h1 {
	margin: 0;
	font-size: 24px;
	line-height: 1.2;
	display: flex;
	align-items: center;
	gap: 10px;
}

.page-lead {
	margin: 8px 0 0;
	color: var(--color-text-muted);
	font-size: 13px;
}

.count-badge,
.kind-count {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 26px;
	height: 26px;
	padding: 0 8px;
	border-radius: 999px;
	corner-shape: round;
	background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	color: var(--color-accent);
	font-size: 14px;
	font-weight: 800;
}

.kind-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-bottom: 10px;
}

.kind-tab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 10px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	corner-shape: round;
	color: var(--color-text);
	font-size: 13px;
	font-weight: 600;
	text-decoration: none;
}

.kind-tab .kind-count {
	min-width: 22px;
	height: 20px;
	font-size: 12px;
}

.kind-tab.active {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}

.kind-description {
	margin: 0 0 14px;
	color: var(--color-text-muted);
	font-size: 13px;
}

.form-message {
	margin: 0 0 12px;
	color: var(--color-danger);
	font-size: 13px;
	font-weight: 600;
}

.empty {
	padding: 24px 0;
	color: var(--color-text-muted);
}

.bulk-form {
	margin-bottom: 12px;
}

.review-list {
	margin: 0;
	padding: 0;
	list-style: none;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	overflow: hidden;
}

.review-item {
	display: grid;
	grid-template-columns: 64px 1fr;
	gap: 14px;
	padding: 14px 16px;
	border-bottom: 1px solid var(--color-border);
}

.review-item:last-child {
	border-bottom: none;
}

.cover {
	width: 64px;
	aspect-ratio: 400 / 566;
	border-radius: 6px;
	background: var(--color-bg);
	overflow: hidden;
}

.cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.review-body {
	min-width: 0;
}

.anime-line {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 8px;
	margin-bottom: 4px;
}

.anime-title {
	color: var(--color-text);
	font-weight: 700;
	text-decoration: none;
}

.anime-title:hover {
	text-decoration: underline;
}

.meta,
.meta-link {
	color: var(--color-text-muted);
	font-size: 12px;
}

.meta-link:hover {
	color: var(--color-accent);
}

.note {
	margin: 0 0 8px;
	color: var(--color-text-muted);
	font-size: 12px;
	word-break: break-all;
}

.choice-form {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.choice {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 6px;
	border-radius: 6px;
	font-size: 13px;
	cursor: pointer;
}

.choice:hover {
	background: color-mix(in srgb, var(--color-text) 4%, transparent);
}

.choice-source {
	flex-shrink: 0;
	min-width: 64px;
	color: var(--color-text-muted);
	font-size: 11px;
	font-weight: 800;
}

.choice-text {
	min-width: 0;
	word-break: break-word;
}

.choice-text.muted {
	color: var(--color-text-muted);
}

.custom-input {
	flex: 1;
	min-width: 0;
	min-height: 30px;
	padding: 0 8px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background: var(--color-bg);
	color: var(--color-text);
	font-size: 13px;
}

.choice-actions {
	display: flex;
	justify-content: flex-end;
	margin-top: 4px;
}

.pager {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 12px;
	margin-top: 16px;
}

.pager-status {
	color: var(--color-text-muted);
	font-size: 13px;
}

@media (max-width: 760px) {
	.list-page {
		width: min(100% - 24px, 1040px);
		padding-top: calc(var(--nav-height) + 12px);
	}

	.review-item {
		grid-template-columns: 48px 1fr;
		gap: 10px;
		padding: 12px;
	}

	.cover {
		width: 48px;
	}

	.choice-source {
		min-width: 52px;
	}
}
</style>
