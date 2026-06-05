<script lang="ts">
import { page } from "$app/state";
</script>

<svelte:head>
	<title>{page.status === 404 ? "ページが見つかりません" : "エラーが発生しました"} — Anipolis</title>
</svelte:head>

<div class="error-container">
	<div class="error-card">
		<div class="error-code">{page.status}</div>
		{#if page.status === 404}
			<h1 class="error-title">ページが見つかりません</h1>
			<p class="error-message">お探しのページは存在しないか、移動した可能性があります。</p>
		{:else}
			<h1 class="error-title">エラーが発生しました</h1>
			<p class="error-message">
				{page.error?.message ?? "予期しないエラーが発生しました。しばらく経ってからもう一度お試しください。"}
			</p>
		{/if}
		<a href="/" class="btn btn-primary">ホームへ戻る</a>
	</div>
</div>

<style>
.error-container {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100vh;
	padding: 24px;
}

.error-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;
	text-align: center;
	max-width: 480px;
	width: 100%;
}

.error-code {
	font-size: 72px;
	font-weight: 800;
	line-height: 1;
	color: var(--color-accent);
	letter-spacing: -2px;
}

.error-title {
	font-size: 22px;
	font-weight: 700;
	color: var(--color-text);
	margin: 0;
}

.error-message {
	font-size: 15px;
	color: var(--color-text-muted);
	line-height: 1.6;
	margin: 0;
}

.btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 10px 24px;
	border-radius: var(--radius-sm);
	font-size: 15px;
	font-weight: 600;
	text-decoration: none;
	transition: background 0.15s;
	margin-top: 8px;
}

.btn-primary {
	background: var(--color-accent);
	color: white;
}

.btn-primary:hover {
	background: var(--color-accent-hover);
	text-decoration: none;
	color: white;
}
</style>
