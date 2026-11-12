<script lang="ts">
import { invalidateAll } from "$app/navigation";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";

// マイリストの読み込み・書き出し（#358）。MyAnimeList のエクスポートをそのまま読み込める

interface ImportResponse {
	inserted: number;
	updated: number;
	skipped: number;
	total: number;
	unmatched: { malId: number; title: string }[];
	invalid: { line: string; reason: string }[];
	invalidCount: number;
}

let file = $state<File | null>(null);
let overwrite = $state(false);
let importing = $state(false);
let errorMessage = $state<string | null>(null);
let result = $state<ImportResponse | null>(null);

async function submit(event: SubmitEvent) {
	event.preventDefault();
	if (!file || importing) return;
	importing = true;
	errorMessage = null;
	result = null;
	const body = new FormData();
	body.set("file", file);
	body.set("overwrite", String(overwrite));
	try {
		const response = await fetch("/api/mylist/import", { method: "POST", body });
		const payload = await response.json().catch(() => null);
		if (!response.ok) {
			errorMessage = payload?.message ?? "読み込みに失敗しました";
			return;
		}
		result = payload as ImportResponse;
		await invalidateAll();
	} catch {
		errorMessage = "通信に失敗しました。もう一度お試しください";
	} finally {
		importing = false;
	}
}
</script>

<svelte:head><title>マイリストの読み込み・書き出し - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<h1 class="settings-title">マイリストの読み込み・書き出し</h1>

			<section class="transfer-section" aria-labelledby="import-heading">
				<h2 id="import-heading" class="transfer-heading">読み込む</h2>
				<p class="transfer-lead">
					MyAnimeList のエクスポート（<a
						href="https://myanimelist.net/panel.php?go=export"
						target="_blank"
						rel="noopener noreferrer"
						>Export My List</a
					>
					で落とした <code>.xml.gz</code>、解凍した <code>.xml</code>）か、ここで書き出した CSV
					を読み込めます。作品は MyAnimeList の ID で探します。
				</p>
				<form class="auth-form" onsubmit={submit}>
					<div class="field">
						<label for="mylist-file" class="field-label">ファイル</label>
						<input
							id="mylist-file"
							type="file"
							accept=".xml,.gz,.csv,application/xml,text/xml,text/csv,application/gzip"
							class="field-input"
							onchange={(event) => {
								file = event.currentTarget.files?.[0] ?? null;
								result = null;
								errorMessage = null;
							}}
						>
						<p class="field-hint">5MB まで。読み込んでも、フォローしている人のタイムラインには流れません</p>
					</div>
					<fieldset class="field transfer-policy">
						<legend class="field-label">登録済みの作品</legend>
						<label class="transfer-radio">
							<input type="radio" name="overwrite" value={false} bind:group={overwrite}>
							今の記録を残す（新しい作品だけ追加）
						</label>
						<label class="transfer-radio">
							<input type="radio" name="overwrite" value={true} bind:group={overwrite}>
							読み込んだ記録で上書きする
						</label>
						<p class="field-hint">上書きしても、ファイルに無いスコアや日付は今の値を残します</p>
					</fieldset>
					<button type="submit" class="btn btn-primary" disabled={!file || importing}>
						{importing ? "読み込み中…" : "読み込む"}
					</button>
				</form>

				{#if errorMessage}
					<div class="flash-error" role="alert">{errorMessage}</div>
				{/if}

				{#if result}
					<div class="flash-success" role="status">
						{result.total.toLocaleString()}
						件のうち、{result.inserted.toLocaleString()}
						件を追加
						{#if result.updated > 0}
							、{result.updated.toLocaleString()}
							件を上書き
						{/if}
						{#if result.skipped > 0}
							、{result.skipped.toLocaleString()}
							件は登録済みのため残しました
						{/if}
						。
						<a href="/mylist">マイリストを見る</a>
					</div>
					{#if result.unmatched.length > 0}
						<details class="transfer-details">
							<summary>
								Anipolis に見つからなかった作品（{result.unmatched.length.toLocaleString()}
								件）
							</summary>
							<p class="field-hint">
								MyAnimeList の ID に当たる作品が、まだ Anipolis
								にありません。作品が増えたら、もう一度読み込むと追加されます。
							</p>
							<ul class="transfer-list">
								{#each result.unmatched as item (item.malId)}
									<li>
										<a
											href="https://myanimelist.net/anime/{item.malId}"
											target="_blank"
											rel="noopener noreferrer"
											>{item.title || `MAL ${item.malId}`}</a
										>
									</li>
								{/each}
							</ul>
						</details>
					{/if}
					{#if result.invalidCount > 0}
						<details class="transfer-details">
							<summary>読めなかった行（{result.invalidCount.toLocaleString()} 件）</summary>
							<ul class="transfer-list">
								{#each result.invalid as item, index (index)}
									<li>{item.line} — {item.reason}</li>
								{/each}
							</ul>
						</details>
					{/if}
				{/if}
			</section>

			<section class="transfer-section" aria-labelledby="export-heading">
				<h2 id="export-heading" class="transfer-heading">書き出す</h2>
				<p class="transfer-lead">
					マイリストをいつでも全部持ち出せます。MyAnimeList の形式は、MyAnimeList の
					<a href="https://myanimelist.net/import.php" target="_blank" rel="noopener noreferrer">Import</a>
					などでそのまま読めます（MyAnimeList の ID が無い作品は入りません）。
				</p>
				<div class="transfer-actions">
					<a class="btn btn-secondary" href="/api/mylist/export?format=mal" download
						>MyAnimeList 形式（XML）</a
					>
					<a class="btn btn-secondary" href="/api/mylist/export?format=csv" download>CSV</a>
				</div>
			</section>
		</div>
	</main>
</div>

<style>
.transfer-section + .transfer-section {
	margin-top: 28px;
	padding-top: 20px;
	border-top: 1px solid var(--color-border);
}

.transfer-heading {
	margin: 0 0 8px;
	font-size: 1rem;
	font-weight: 700;
}

.transfer-lead {
	margin: 0 0 16px;
	color: var(--color-text-muted);
	font-size: 0.875rem;
	line-height: 1.7;
}

.transfer-policy {
	border: none;
	margin: 0;
	padding: 0;
}

.transfer-radio {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 36px;
	font-size: 0.875rem;
	cursor: pointer;
}

.transfer-details {
	margin-top: 12px;
	font-size: 0.875rem;
}

.transfer-details summary {
	cursor: pointer;
	min-height: 36px;
	display: flex;
	align-items: center;
}

.transfer-list {
	max-height: 240px;
	overflow-y: auto;
	margin: 8px 0 0;
	padding-left: 20px;
	line-height: 1.8;
}

.transfer-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
</style>
