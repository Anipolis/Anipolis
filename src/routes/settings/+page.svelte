<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/state";
import PrivacyToggles from "$lib/components/PrivacyToggles.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

/**
 * 設定の一覧。見出し（カテゴリ）と項目の定義は1つで、見せ方だけ画面の幅で変える。
 * PC は左にカテゴリ、右に選んだカテゴリの項目（?section= に残す）。スマホは全カテゴリを見出し付きで縦に並べる
 */
type SectionId = "account" | "login" | "visibility" | "mute" | "notify" | "about";

type Item = { label: string; description: string; href: string; badge?: number };
type Section = { id: SectionId; label: string; items: Item[]; privacyToggles?: boolean };

// 整理前の ?section= で来たとき（古いリンク・ブックマーク）の行き先
const LEGACY_SECTIONS: Record<string, SectionId> = { privacy: "visibility", rooms: "notify" };

// 規約・ポリシー・出典と問い合わせ先。未ログイン時はトレンド欄下にも同じリンクを出す
const aboutItems: Item[] = [
	{ label: "利用規約", description: "本サービスの利用条件を確認できます", href: "/terms" },
	{
		label: "プライバシーポリシー",
		description: "個人情報の取扱いについて確認できます",
		href: "/privacy-policy",
	},
	{
		label: "出典・権利",
		description: "作品情報の出典・ライセンスと、権利者の方への窓口を確認できます",
		href: "/data-sources",
	},
	{
		label: "お問い合わせ",
		description: "運営への連絡先（一般・権利者の方・個人情報）を確認できます",
		href: "/contact",
	},
];

const sections = $derived.by((): Section[] => {
	const login: Item[] = [
		{
			label: data.hasEmailProvider ? "パスワードの変更" : "パスワードの設定",
			description: data.hasEmailProvider
				? "現在のパスワードを確認して変更します"
				: "メールアドレスとパスワードでもログインできるようになります",
			href: "/settings/account/password",
		},
	];
	if (data.passkeyEnabled) {
		login.push({
			label: "パスキー",
			description: "指紋・顔認証や画面ロックでログインできるようにします",
			href: "/settings/passkeys",
		});
	}
	// 管理者の権限は二段階認証を済ませたログインでだけ使える（migration 177）。今は管理者だけに出す
	if (data.profile?.is_admin) {
		login.push({
			label: "二段階認証",
			description: "ログインのときに認証アプリのコードも確認します（管理画面を使うのに必要です）",
			href: "/settings/security",
		});
	}
	const pendingRequests = data.pendingFollowRequestCount ?? 0;
	return [
		{
			id: "account",
			label: "アカウント",
			items: [
				{ label: "ユーザー名", description: "ユーザー名を変更します", href: "/settings/account" },
				{
					label: "招待",
					description: "招待コードを発行して他のユーザーを招待します",
					href: "/settings/invites",
				},
				{
					label: "マイリストの読み込み・書き出し",
					description: "MyAnimeList などとの間で視聴記録を移します",
					href: "/settings/mylist-data",
				},
				{
					label: "退会",
					description: "アカウントと投稿・マイリストをすべて削除します",
					href: "/settings/account/delete",
				},
			],
		},
		{ id: "login", label: "ログイン", items: login },
		{
			id: "visibility",
			label: "公開範囲",
			privacyToggles: true,
			items: [
				{
					label: "フォローリクエスト",
					description:
						pendingRequests > 0
							? `${pendingRequests}件の申請が届いています`
							: "鍵アカウントへのフォローの申請を承認・拒否します",
					href: "/settings/follow-requests",
					...(pendingRequests > 0 ? { badge: pendingRequests } : {}),
				},
			],
		},
		{
			id: "mute",
			label: "ミュートとブロック",
			items: [
				{
					label: "ミュート",
					description: "ワード・作品・ユーザーのミュートをまとめて管理します",
					href: "/settings/mutes",
				},
				{
					label: "ブロックしたユーザー",
					description: "ブロックした相手を確認・解除します",
					href: "/settings/blocks",
				},
			],
		},
		{
			id: "notify",
			label: "通知",
			items: [
				{
					label: "放送前リマインダー",
					description:
						"カレンダーでベルを付けた番組を、始まる何分前に知らせるかを決めます（カレンダーと画面の端に出ます）",
					href: "/settings/rooms/notifications",
				},
			],
		},
		{ id: "about", label: "Anipolisについて", items: aboutItems },
	];
});

const activeSection = $derived.by((): SectionId => {
	const param = page.url.searchParams.get("section") ?? "";
	const id = LEGACY_SECTIONS[param] ?? param;
	return sections.some((s) => s.id === id) ? (id as SectionId) : "account";
});

let privacyStatus = $state<"idle" | "saving" | "saved">("idle");
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
									onclick={() =>
										goto(`?section=${section.id}`, { replaceState: true, noScroll: true })}
									aria-current={activeSection === section.id ? "page" : undefined}
								>
									{section.label}
								</button>
							</li>
						{/each}
					</ul>
				</nav>

				<div class="settings-panel">
					{#each sections as section (section.id)}
						<section
							class="settings-section-block"
							class:active={activeSection === section.id}
							data-section={section.id}
							aria-labelledby="settings-section-{section.id}"
						>
							<div class="settings-section-heading">
								<h2 id="settings-section-{section.id}">{section.label}</h2>
								{#if section.privacyToggles}
									<span
										class="autosave-status"
										class:visible={privacyStatus !== "idle"}
										aria-live="polite"
									>
										{#if privacyStatus === "saving"}
											保存中…
										{:else if privacyStatus === "saved"}
											✓ 保存しました
										{/if}
									</span>
								{/if}
							</div>
							{#if section.privacyToggles}
								<div class="settings-toggles">
									<PrivacyToggles
										isPrivate={data.profile?.is_private ?? false}
										listIsPublic={data.profile?.list_is_public ?? true}
										onstatus={(next) => (privacyStatus = next)}
									/>
								</div>
							{/if}
							<nav class="settings-item-list" aria-label="{section.label}の設定メニュー">
								{#each section.items as item (item.href)}
									<a href={item.href} class="settings-item-link">
										<span>
											<strong>
												{item.label}
												{#if item.badge}
													<span class="settings-item-badge">{item.badge}</span>
												{/if}
											</strong>
											<small>{item.description}</small>
										</span>
										<span class="settings-item-arrow" aria-hidden="true">›</span>
									</a>
								{/each}
							</nav>
						</section>
					{/each}
				</div>
			</div>
		</div>
	</main>
</div>

<style>
.settings-shell {
	display: grid;
	/* 1fr だと列の最小幅が中身の最小幅になり、スマホでタブの合計幅に引っ張られて画面からはみ出す（#418） */
	grid-template-columns: 220px minmax(0, 1fr);
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

/* PC は選んだカテゴリだけを出す（スマホは下の @media で全部出す） */
.settings-section-block {
	display: none;
}

.settings-section-block.active {
	display: block;
}

.settings-section-heading {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}

.settings-section-heading h2 {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.autosave-status {
	color: var(--color-text-muted);
	font-size: 0.78rem;
	opacity: 0;
	transition: opacity 0.2s ease;
}

.autosave-status.visible {
	opacity: 1;
}

.settings-toggles {
	margin-top: 12px;
	border-top: 1px solid var(--color-border);
}

.settings-toggles :global(.toggle-row) {
	padding: 16px 0;
	border-bottom: 1px solid var(--color-border);
}

/* スイッチの項目名も、リンクの項目名と同じ大きさにそろえる */
.settings-toggles :global(.toggle-row-text strong) {
	font-size: 0.95rem;
}

.settings-item-list {
	display: flex;
	flex-direction: column;
	margin-top: 12px;
}

/* スイッチの下に続く項目は、スイッチの区切り線と二重にしない */
.settings-toggles + .settings-item-list {
	margin-top: 0;
}

.settings-toggles + .settings-item-list .settings-item-link:first-child {
	border-top: none;
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

.settings-item-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 18px;
	height: 18px;
	margin-left: 6px;
	padding: 0 5px;
	border-radius: 9px;
	background: var(--color-accent);
	color: var(--color-bg);
	font-size: 0.72rem;
	font-weight: 700;
	vertical-align: 1px;
}

.settings-item-arrow {
	color: var(--color-text-muted);
	font-size: 1.5rem;
	flex-shrink: 0;
	line-height: 1;
}

/* スマホはカテゴリを選ばせず、全カテゴリを見出し付きで縦に並べる */
@media (max-width: 640px) {
	.settings-shell {
		grid-template-columns: minmax(0, 1fr);
	}

	.settings-sidebar {
		border-right: none;
		padding: 16px 0 0;
	}

	.settings-sidebar-header {
		padding: 0 16px 4px;
		border-bottom: none;
		margin-bottom: 0;
	}

	.settings-nav-list {
		display: none;
	}

	.settings-panel {
		padding: 0 16px 12px;
	}

	.settings-section-block {
		display: block;
		padding-top: 20px;
	}

	.settings-section-heading h2 {
		color: var(--color-text-muted);
		font-size: 0.82rem;
		font-weight: 600;
	}

	.settings-item-list,
	.settings-toggles {
		margin-top: 4px;
	}

	.settings-section-block:last-child .settings-item-link:last-child {
		border-bottom: none;
	}

	/* スマホの一覧は項目名だけにする（見出し・項目名・説明の段が多く分かりにくいため）。
	   スイッチの詳しい説明は横の ⓘ で読める。PC は項目が少なく余白もあるので説明を残す */
	.settings-item-link small,
	.settings-toggles :global(.toggle-row-text small) {
		display: none;
	}

	.settings-item-link,
	.settings-toggles :global(.toggle-row) {
		padding: 14px 0;
	}
}
</style>
