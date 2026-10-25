<script lang="ts">
import type { Snippet } from "svelte";
import { page } from "$app/state";
import LegalBody from "./LegalBody.svelte";

interface Props {
	title: string;
	/** docs/*.md を marked で変換した、当方が管理する HTML */
	html?: string;
	/** HTML の代わりに Svelte で書く本文（お問い合わせページなど） */
	children?: Snippet;
}

let { title, html, children }: Props = $props();

// 設定メニューはログイン必須なので、未ログインの閲覧者には戻り先として出さない
const showSettingsLink = $derived(Boolean(page.data.user));
</script>

<svelte:head><title>{title} - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 720px; min-width: 0;">
		<div class="settings-card legal-document">
			{#if showSettingsLink}
				<a href="/settings?section=about" class="btn btn-ghost back-link" aria-label="設定メニューへ戻る">
					<span class="i-lucide-arrow-left" aria-hidden="true"></span>
					設定へ戻る
				</a>
			{/if}

			<LegalBody {html} {children} />
		</div>
	</main>
</div>

<style>
.back-link {
	margin-bottom: 16px;
}
</style>
