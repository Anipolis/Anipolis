<script lang="ts">
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head> <title>設定 - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">設定</h1>
				{#if data.profile}
					<a href="/profile/{data.profile.username}?tab=edit" class="btn btn-ghost">プロフィール編集</a>
				{/if}
			</div>

			<nav class="settings-category-list" aria-label="設定カテゴリ">
				<a href="/settings/account" class="settings-category-link">
					<span>
						<strong>アカウント</strong>
						<small>ユーザー名を変更します。</small>
					</span>
					<span class="settings-category-arrow" aria-hidden="true">›</span>
				</a>

				<a href="/settings/privacy" class="settings-category-link">
					<span>
						<strong>プライバシーと安全</strong>
						<small>鍵アカウントとミュートワードを管理します。</small>
					</span>
					<span class="settings-category-arrow" aria-hidden="true">›</span>
				</a>
			</nav>
		</div>
	</main>
</div>

<style>
.settings-category-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 18px;
}

.settings-category-link {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 14px 0;
	color: inherit;
	text-decoration: none;
	border-bottom: 1px solid var(--color-border);
}

.settings-category-link:first-child {
	border-top: 1px solid var(--color-border);
}

.settings-category-link strong,
.settings-category-link small {
	display: block;
}

.settings-category-link strong {
	font-size: 0.96rem;
}

.settings-category-link small {
	margin-top: 4px;
	color: var(--color-text-muted);
	font-size: 0.82rem;
}

.settings-category-link:hover strong {
	color: var(--color-accent);
}

.settings-category-arrow {
	color: var(--color-text-muted);
	font-size: 1.4rem;
}
</style>
