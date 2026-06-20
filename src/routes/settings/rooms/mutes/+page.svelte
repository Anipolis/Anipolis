<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { AnimeMute } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps & { form: { message?: string; roomMuteSuccess?: boolean } | null } = $props();

// Tracks which anime's accordion is open (anime_id string or null)
let editingAnimeId = $state<string | null>(untrack(() => data.stagedAnimeId ?? null));

// Per-accordion: track the selected mute_type radio so period fields show/hide reactively
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
	// Clear pending type override when closing
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
		await goto("/settings/rooms/mutes", { invalidateAll: true, replaceState: true });
	};
};

const removeSubmit: SubmitFunction = () => {
	return async ({ result, update }) => {
		await update({ reset: false });
		if (result.type !== "failure") {
			await goto("/settings/rooms/mutes", { invalidateAll: true, replaceState: true });
		}
	};
};
</script>

<svelte:head> <title>ルームミュート設定 - Anipolis</title> </svelte:head>

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
					onchange={() => {
						pendingMuteType = { ...pendingMuteType, [_animeId]: "period" };
					}}
				>
				<span>期間指定</span>
			</label>
			<label class="mute-type-label">
				<input
					type="radio"
					name="mute_type"
					value="always"
					checked={currentMuteType === "always"}
					onchange={() => {
						pendingMuteType = { ...pendingMuteType, [_animeId]: "always" };
					}}
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
				<h1 class="settings-title">ルームミュート</h1>
			</div>

			{#if form?.message}
				<div class="flash-error">{form.message}</div>
			{/if}
			{#if form?.roomMuteSuccess && !editingAnimeId}
				<div class="flash-success">ミュート設定を保存しました。</div>
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
					<div class="mute-list">
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
		</div>
	</main>
</div>

<style>
.settings-section {
	padding-top: 18px;
	margin-top: 18px;
	border-top: 1px solid var(--border, #334155);
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
.mute-list {
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
	height: 52px;
	object-fit: cover;
	border-radius: 4px;
	flex-shrink: 0;
}
.mute-cover--placeholder {
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
