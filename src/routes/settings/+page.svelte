<script lang="ts">
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

type SectionId = "account" | "privacy" | "notifications";

let activeSection = $state<SectionId>("account");

const sections: { id: SectionId; label: string }[] = [
	{ id: "account", label: "アカウント" },
	{ id: "privacy", label: "プライバシーと安全" },
	{ id: "notifications", label: "通知" },
];

type Item = { label: string; description: string; href: string };

const items = $derived.by((): Item[] => {
	if (activeSection === "account") {
		const list: Item[] = [
			{ label: "ユーザー名", description: "ユーザー名を変更します", href: "/settings/account" },
		];
		if (!data.hasEmailProvider) {
			list.push({
				label: "パスワードの設定",
				description: "メールアドレスとパスワードでもログインできるようになります",
				href: "/settings/account/password",
			});
		}
		return list;
	}
	if (activeSection === "privacy") {
		return [
			{
				label: "プライバシー",
				description: "鍵アカウントを管理します",
				href: "/settings/privacy",
			},
			{
				label: "ミュートワード",
				description: "非表示にするワードを管理します",
				href: "/settings/mutes",
			},
			{
				label: "フォローリクエスト",
				description: `${data.pendingFollowRequestCount}件の未対応申請を確認します`,
				href: "/settings/follow-requests",
			},
		];
	}
	return [
		{
			label: "通知",
			description: "放送前通知のタイミングを設定します",
			href: "/settings/notifications",
		},
	];
});

const activeLabel = $derived(sections.find((s) => s.id === activeSection)?.label ?? "");
</script>

<svelte:head><title>設定 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 860px; min-width: 0;">
		<div class="settings-card" style="padding: 0; overflow: hidden;">
			<div class="settings-shell">
				<nav class="settings-sidebar" aria-label="設定カテゴリ">
					<div class="settings-sidebar-header">
						<h1 class="settings-sidebar-title">設定</h1>
					</div>
					<ul class="settings-nav-list">
						{#each sections as section (section.id)}
							<li>
								<button
									type="button"
									class="settings-nav-item"
									class:active={activeSection === section.id}
									onclick={() => {
										activeSection = section.id;
									}}
									aria-current={activeSection === section.id ? "page" : undefined}
								>
									{section.label}
								</button>
							</li>
						{/each}
					</ul>
				</nav>

				<div class="settings-panel">
					<h2 class="settings-panel-title">{activeLabel}</h2>
					<nav class="settings-item-list" aria-label="{activeLabel}の設定メニュー">
						{#each items as item (item.href)}
							<a href={item.href} class="settings-item-link">
								<span>
									<strong>{item.label}</strong>
									<small>{item.description}</small>
								</span>
								<span class="settings-item-arrow" aria-hidden="true">›</span>
							</a>
						{/each}
					</nav>
				</div>
			</div>
		</div>
	</main>
</div>

<style>
.settings-shell {
	display: grid;
	grid-template-columns: 220px 1fr;
	min-height: 420px;
}

.settings-sidebar {
	border-right: 1px solid var(--color-border);
	padding: 28px 0;
}

.settings-sidebar-header {
	padding: 0 24px 16px;
	border-bottom: 1px solid var(--color-border);
	margin-bottom: 8px;
}

.settings-sidebar-title {
	font-size: 1.15rem;
	font-weight: 700;
	margin: 0;
}

.settings-nav-list {
	list-style: none;
	margin: 0;
	padding: 0;
}

.settings-nav-item {
	display: block;
	width: 100%;
	padding: 12px 24px;
	text-align: left;
	background: none;
	border: none;
	color: var(--color-fg);
	font-size: 0.95rem;
	cursor: pointer;
	transition: background 0.12s;
}

.settings-nav-item:hover {
	background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}

.settings-nav-item.active {
	background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	color: var(--color-accent);
	font-weight: 600;
}

.settings-panel {
	padding: 28px 32px;
}

.settings-panel-title {
	font-size: 1.05rem;
	font-weight: 700;
	margin: 0 0 8px;
}

.settings-item-list {
	display: flex;
	flex-direction: column;
	margin-top: 12px;
}

.settings-item-link {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 16px 0;
	color: inherit;
	text-decoration: none;
	border-bottom: 1px solid var(--color-border);
}

.settings-item-link:first-child {
	border-top: 1px solid var(--color-border);
}

.settings-item-link strong,
.settings-item-link small {
	display: block;
}

.settings-item-link strong {
	font-size: 0.95rem;
}

.settings-item-link small {
	margin-top: 4px;
	color: var(--color-text-muted);
	font-size: 0.82rem;
}

.settings-item-link:hover strong {
	color: var(--color-accent);
}

.settings-item-arrow {
	color: var(--color-text-muted);
	font-size: 1.5rem;
	flex-shrink: 0;
	line-height: 1;
}

@media (max-width: 640px) {
	.settings-shell {
		grid-template-columns: 1fr;
	}

	.settings-sidebar {
		border-right: none;
		border-bottom: 1px solid var(--color-border);
		padding: 16px 0 0;
	}

	.settings-sidebar-header {
		padding: 0 16px 12px;
	}

	.settings-nav-list {
		display: flex;
		flex-direction: row;
		overflow-x: auto;
		padding: 0 12px 12px;
		gap: 4px;
	}

	.settings-nav-item {
		padding: 8px 14px;
		border-radius: 20px;
		white-space: nowrap;
		font-size: 0.88rem;
	}

	.settings-nav-item.active {
		background: var(--color-accent);
		color: #fff;
	}

	.settings-panel {
		padding: 20px 16px;
	}
}
</style>
