<script lang="ts">
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head><title>プライバシーポリシー - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 720px; min-width: 0;">
		<div class="settings-card privacy-policy">
			<a href="/settings?section=privacy" class="btn btn-ghost back-link" aria-label="設定メニューへ戻る">
				<span class="i-lucide-arrow-left" aria-hidden="true"></span>
				設定へ戻る
			</a>

			{@html data.html}
		</div>
	</main>
</div>

<style>
.back-link {
	margin-bottom: 16px;
}

.privacy-policy :global(h1) {
	font-size: 20px;
	font-weight: 700;
	margin-bottom: 24px;
}

.privacy-policy :global(h2) {
	font-size: 1.15rem;
	font-weight: 700;
	margin: 32px 0 12px;
}

.privacy-policy :global(h3) {
	font-size: 1rem;
	font-weight: 700;
	margin: 20px 0 8px;
}

.privacy-policy :global(p),
.privacy-policy :global(ul),
.privacy-policy :global(ol) {
	margin: 0 0 12px;
	line-height: 1.7;
}

.privacy-policy :global(ul),
.privacy-policy :global(ol) {
	padding-left: 1.4em;
}

.privacy-policy :global(li) {
	margin-bottom: 4px;
}

.privacy-policy :global(table) {
	width: 100%;
	border-collapse: collapse;
	margin: 0 0 16px;
	font-size: 0.92rem;
}

.privacy-policy :global(th),
.privacy-policy :global(td) {
	border: 1px solid var(--color-border);
	padding: 8px 12px;
	text-align: left;
	vertical-align: top;
}

.privacy-policy :global(th) {
	background: color-mix(in srgb, var(--color-accent) 6%, transparent);
	white-space: nowrap;
}
</style>
