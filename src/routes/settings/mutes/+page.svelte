<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { AnimeMute } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

// ワード tab
let word = $state("");
let adding = $state(false);

const muteSubmit: SubmitFunction = () => {
	adding = true;
	return async ({ update }) => {
		adding = false;
		await update();
		if (form?.muteSuccess) word = "";
	};
};

// アニメ tab
const stagedAnimeId = $derived(data.stagedAnimeId ?? null);
const wordTabHref = $derived(
	stagedAnimeId ? `/settings/mutes?tab=word&anime_id=${encodeURIComponent(stagedAnimeId)}` : "/settings/mutes",
);
const animeTabHref = $derived(
	stagedAnimeId
		? `/settings/mutes?tab=anime&anime_id=${encodeURIComponent(stagedAnimeId)}`
		: "/settings/mutes?tab=anime",
);
let editingAnimeId = $state<string | null>(untrack(() => data.stagedAnimeId ?? null));
let pendingMuteType = $state<Record<string, "period" | "always">>({});

function getMuteType(animeId: string, mute: AnimeMute | null): "period" | "always" {
	return pendingMuteType[animeId] ?? mute?.mute_type ?? "period";
}

function muteStatusLabel(mute: AnimeMute): string {
	if (mute.mute_type === "always") return "常にミュート中";
	const days = mute.period_days ?? 3;
	return mute.is_repeat ? `放送後${days}日間（毎週）` : `放送後${days}日間`;
}

function toggleEdit(animeId: string) {
	editingAnimeId = editingAnimeId === animeId ? null : animeId;
	if (editingAnimeId !== animeId) {
		const { [animeId]: _removed, ...rest } = pendingMuteType;
		pendingMuteType = rest;
	}
}

const updateSubmit: SubmitFunction = ({ formData }) => {
	const animeId = formData.get("anime_id") as string;
	return async ({ result, update }) => {
		await update({ reset: false });
		if (result.type === "failure") {
			editingAnimeId = animeId;
			return;
		}
		editingAnimeId = null;
		const { [animeId]: _removed, ...rest } = pendingMuteType;
		pendingMuteType = rest;
		await goto("/settings/mutes?tab=anime", { invalidateAll: true, replaceState: true });
	};
};

const removeSubmit: SubmitFunction = () => {
	return async ({ result, update }) => {
		await update({ reset: false });
		if (result.type !== "failure") {
			await goto("/settings/mutes?tab=anime", { invalidateAll: true, replaceState: true });
		}
	};
};

const activeTab = $derived.by((): "word" | "anime" => {
	const tab = page.url.searchParams.get("tab");
	if (tab === "anime") return "anime";
	if (tab === "word") return "word";
	if (stagedAnimeId) return "anime";
	return "word";
});
</script>

<svelte:head><title>ミュート設定 - Anipolis</title></svelte:head>

{#snippet muteForm(_animeId: string, _mute: AnimeMute | null)}
	{@const currentMuteType = getMuteType(_animeId, _mute)}
	<form method="POST" action="?/updateAnimeMute" use:enhance={updateSubmit} class="mute-accordion-form">
		<input type="hidden" name="anime_id" value={_animeId}>
		<div class="mute-type-row">
			<label class="mute-type-label">
				<input
					type="radio"
					name="mute_type"
					value="period"
					checked={currentMuteType === "period"}
					onchange={() => { pendingMuteType = { ...pendingMuteType, [_animeId]: "period" }; }}
				>
				<span>期間指定</span>
			</label>
			<label class="mute-type-label">
				<input
					type="radio"
					name="mute_type"
					value="always"
					checked={currentMuteType === "always"}
					onchange={() => { pendingMuteType = { ...pendingMuteType, [_animeId]: "always" }; }}
				>
				<span>常にミュート</span>
			</label>
		</div>
		{#if currentMuteType === "period"}
			<div class="mute-period-row">
				<label class="mute-period-label" for="period-days-{_animeId}">ミュート期間</label>
				<select id="period-days-{_animeId}" name="period_days" class="field-input mute-select">
					{#each [1, 2, 3, 4, 5, 6, 7] as days}
						<option value={days} selected={(_mute?.period_days ?? 3) === days}>{days}日</option>
					{/each}
				</select>
				<label class="mute-repeat-check">
					<input type="checkbox" name="is_repeat" checked={_mute?.is_repeat ?? true}>
					毎週繰り返す
				</label>
			</div>
		{/if}
		<div class="mute-accordion-actions">
			<button type="submit" class="btn btn-primary btn-sm">保存</button>
		</div>
	</form>
{/snippet}

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">ミュート設定</h1>
			</div>

			<div class="mute-tabs" role="tablist" aria-label="ミュート種別">
				<a
					href={wordTabHref}
					class="mute-tab"
					class:active={activeTab === "word"}
					role="tab"
					aria-selected={activeTab === "word"}
					>ワード</a
				>
				<a
					href={animeTabHref}
					class="mute-tab"
					class:active={activeTab === "anime"}
					role="tab"
					aria-selected={activeTab === "anime"}
					>アニメ</a
				>
			</div>

			{#if activeTab === "word"}
				{#if form && "message" in form && !("field" in form)}
					<div class="flash-error" role="alert">{form.message}</div>
				{/if}

				<form method="POST" action="?/addMute" use:enhance={muteSubmit} class="mute-add-form">
					<div class="field" style="margin-bottom: 0;">
						<label for="word" class="field-label">ミュートするワード</label>
						<input
							id="word"
							name="word"
							type="text"
							class="field-input"
							class:field-error={form && "field" in form && form["field"] === "word"}
							placeholder="例: ネタバレ"
							maxlength="80"
							bind:value={word}
						>
						{#if form && "field" in form && form["field"] === "word"}
							<p class="field-error-msg">{form.message}</p>
						{:else}
							<p class="field-hint">
								英数本文、正規表現、作品名、ハッシュタグに含まれる語を非表示にします。
							</p>
						{/if}
					</div>
					<button type="submit" class="btn btn-primary" disabled={adding}>
						{adding ? "追加中..." : "追加"}
					</button>
				</form>

				<div class="mute-list">
					{#if data.mutedWords.length === 0}
						<div class="empty-state compact">
							<p>ミュート中のワードはありません。</p>
						</div>
					{:else}
						{#each data.mutedWords as mutedWord (mutedWord.id)}
							<div class="mute-list-item">
								<div>
									<div class="mute-word">{mutedWord.word}</div>
									<time class="mute-date" datetime={mutedWord.created_at}>
										{new Date(mutedWord.created_at).toLocaleDateString("ja-JP")}
									</time>
								</div>
								<form method="POST" action="?/removeMute" use:enhance>
									<input type="hidden" name="id" value={mutedWord.id}>
									<button type="submit" class="btn btn-ghost danger">解除</button>
								</form>
							</div>
						{/each}
					{/if}
				</div>
			{:else}
				{#if form && "message" in form}
					<div class="flash-error" role="alert">{form.message}</div>
				{/if}

				<section class="settings-section">
					<p class="settings-section-desc">
						ネタバレ防止のため、ミュート設定した作品の放送ルーム投稿をタイムラインで非表示にします。
					</p>

					{#if data.virtualAnime}
						{@const v = data.virtualAnime}
						<div class="mute-item mute-item--virtual">
							<div class="mute-row">
								{#if v.cover_url}
									<img src={v.cover_url} alt={v.title} class="mute-cover">
								{:else}
									<div class="mute-cover mute-cover--placeholder"></div>
								{/if}
								<div class="mute-meta">
									<span class="mute-title">{v.title}</span>
									<span class="mute-status mute-status--none">未設定</span>
								</div>
								<div class="mute-item-actions">
									<button type="button" class="btn btn-ghost btn-sm" onclick={() => toggleEdit(v.id)}>
										{editingAnimeId === v.id ? "閉じる" : "設定する"}
									</button>
								</div>
							</div>
							{#if editingAnimeId === v.id}
								{@render muteForm(v.id, null)}
							{/if}
						</div>
					{/if}

					{#if data.mutes.length === 0 && !data.virtualAnime}
						<p class="mute-empty">ミュート中の作品はありません。</p>
					{:else if data.mutes.length > 0}
						<div class="mute-items-list">
							{#each data.mutes as mute (mute.anime_id)}
								<div class="mute-item">
									<div class="mute-row">
										{#if mute.anime_cover_url}
											<img src={mute.anime_cover_url} alt={mute.anime_title} class="mute-cover">
										{:else}
											<div class="mute-cover mute-cover--placeholder"></div>
										{/if}
										<div class="mute-meta">
											<span class="mute-title">{mute.anime_title}</span>
											<span class="mute-status">{muteStatusLabel(mute)}</span>
										</div>
										<div class="mute-item-actions">
											<button
												type="button"
												class="btn btn-ghost btn-sm"
												onclick={() => toggleEdit(mute.anime_id)}
											>
												{editingAnimeId === mute.anime_id ? "閉じる" : "編集"}
											</button>
											<form
												method="POST"
												action="?/removeAnimeMute"
												use:enhance={removeSubmit}
												style="display:contents"
											>
												<input type="hidden" name="anime_id" value={mute.anime_id}>
												<button type="submit" class="btn btn-ghost danger btn-sm">解除</button>
											</form>
										</div>
									</div>
									{#if editingAnimeId === mute.anime_id}
										{@render muteForm(mute.anime_id, mute)}
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</section>
			{/if}
		</div>
	</main>
</div>

<style>
.mute-tabs {
	display: flex;
	gap: 4px;
	margin: 4px 0 20px;
	border-bottom: 1px solid var(--color-border);
}
.mute-tab {
	padding: 8px 18px;
	border-radius: 6px 6px 0 0;
	font-size: 0.9rem;
	font-weight: 500;
	color: var(--color-text-muted);
	text-decoration: none;
	border: 1px solid transparent;
	border-bottom: none;
	margin-bottom: -1px;
	transition:
		color 0.12s,
		background 0.12s;
}
.mute-tab:hover {
	color: var(--color-fg);
	background: color-mix(in srgb, var(--color-accent) 6%, transparent);
}
.mute-tab.active {
	color: var(--color-accent);
	font-weight: 600;
	border-color: var(--color-border);
	background: var(--color-surface);
}
.settings-section {
	padding-top: 18px;
	margin-top: 0;
}
.settings-section-desc,
.mute-empty {
	color: var(--text-muted, #94a3b8);
	font-size: 0.82rem;
	line-height: 1.6;
	margin: 0 0 16px;
}
.mute-empty {
	margin: 0;
}
.mute-items-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.mute-item {
	border: 1px solid var(--border, #334155);
	border-radius: 10px;
	background: var(--card-bg);
	overflow: hidden;
}
.mute-item--virtual {
	border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
	background: color-mix(in srgb, var(--accent) 4%, var(--card-bg));
}
.mute-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
}
.mute-cover {
	width: 36px;
	border-radius: 4px;
	flex-shrink: 0;
}
.mute-cover:is(img) {
	display: block;
	image-rendering: auto;
}
.mute-cover--placeholder {
	aspect-ratio: 9 / 13;
	background: var(--border);
}
.mute-meta {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}
.mute-title {
	font-size: 0.88rem;
	font-weight: 600;
	color: var(--text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.mute-status {
	font-size: 0.74rem;
	color: var(--accent);
}
.mute-status--none {
	color: var(--text-muted);
}
.mute-item-actions {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
}
.mute-accordion-form {
	border-top: 1px solid var(--border);
	padding: 14px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.mute-type-row {
	display: flex;
	gap: 20px;
}
.mute-type-label {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--text);
	cursor: pointer;
}
.mute-type-label input {
	width: 15px;
	height: 15px;
	accent-color: var(--accent);
}
.mute-period-row {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}
.mute-period-label {
	font-size: 0.78rem;
	color: var(--text-muted);
	white-space: nowrap;
}
.mute-select {
	padding: 5px 8px;
	min-width: 80px;
}
.mute-repeat-check {
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 0.78rem;
	color: var(--text-muted);
	cursor: pointer;
	white-space: nowrap;
}
.mute-repeat-check input {
	width: 14px;
	height: 14px;
	accent-color: var(--accent);
}
.mute-accordion-actions {
	display: flex;
	justify-content: flex-end;
}
@media (max-width: 500px) {
	.mute-item-actions {
		flex-direction: column;
		align-items: flex-end;
	}
}
</style>
