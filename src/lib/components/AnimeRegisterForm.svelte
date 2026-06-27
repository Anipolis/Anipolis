<script lang="ts">
import { enhance } from "$app/forms";
import { ANIME_GENRES, ANIME_SOURCE_OPTIONS } from "$lib/anime-vocabulary";
import type { Anime } from "$lib/types";

type FormResult = { success?: boolean; animeId?: string | number; message?: string } | null | undefined;
let {
	form,
	mode = "create",
	anime = null,
	action = "?/registerAnime",
}: {
	form: FormResult;
	mode?: "create" | "edit";
	anime?: Anime | null;
	action?: string;
} = $props();

const GENRES = [...ANIME_GENRES];
const SOURCE_OPTIONS = [...ANIME_SOURCE_OPTIONS];

// svelte-ignore state_referenced_locally
let selectedGenres = $state<string[]>(anime?.genre ?? []);
// svelte-ignore state_referenced_locally
let studios = $state<string[]>(anime?.studio ?? []);
// svelte-ignore state_referenced_locally
let producers = $state<string[]>(anime?.producer ?? []);
// svelte-ignore state_referenced_locally
let hashtags = $state<string[]>(anime?.official_hashtag ?? []);
let studioInput = $state("");
let producerInput = $state("");
let hashtagInput = $state("");
const isEditMode = $derived(mode === "edit");
const broadcastStationValue = $derived((anime?.broadcast_station ?? []).join(", "));

function dateValue(value: string | null | undefined) {
	return value ? value.slice(0, 10) : "";
}

function toggleGenre(g: string) {
	selectedGenres = selectedGenres.includes(g) ? selectedGenres.filter((x) => x !== g) : [...selectedGenres, g];
}
function addTag(list: string[], input: string, setter: (v: string[]) => void, clearFn: () => void) {
	const val = input.trim().replace(/^#/, "");
	if (val && !list.includes(val)) setter([...list, val]);
	clearFn();
}
function removeTag(list: string[], val: string, setter: (v: string[]) => void) {
	setter(list.filter((x) => x !== val));
}

let imageFile = $state<File | null>(null);
let imagePreview = $state<string | null>(null);
let resizedBlob = $state<Blob | null>(null);
let imageProcessing = $state(false);

async function resizeImage(file: File, maxWidth = 800): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const blobUrl = URL.createObjectURL(file);
		img.onload = () => {
			URL.revokeObjectURL(blobUrl);
			const scale = Math.min(1, maxWidth / img.width);
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(img.width * scale);
			canvas.height = Math.round(img.height * scale);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("2d context not available"));
				return;
			}
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			canvas.toBlob(
				(blob) => {
					if (blob) resolve(blob);
					else reject(new Error("toBlob failed"));
				},
				"image/jpeg",
				0.88,
			);
		};
		img.onerror = () => reject(new Error("Image load error"));
		img.src = blobUrl;
	});
}

async function handleFileChange(e: Event) {
	const file = (e.target as HTMLInputElement).files?.[0];
	if (!file) {
		imageFile = null;
		imagePreview = null;
		resizedBlob = null;
		return;
	}
	imageFile = file;
	imageProcessing = true;
	try {
		const blob = await resizeImage(file);
		resizedBlob = blob;
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		imagePreview = URL.createObjectURL(blob);
	} catch {
		resizedBlob = null;
		imagePreview = null;
	}
	imageProcessing = false;
}
</script>

<div class="register-section" class:register-section--edit={isEditMode}>
	<h2 class="register-title">{isEditMode ? "作品情報を編集" : "アニメ登録"}</h2>

	{#if form?.success}
		<div class="form-success" aria-live="polite">
			{isEditMode ? "更新しました！" : "登録しました！"} <a href="/anime/{form.animeId}">詳細を見る →</a>
		</div>
	{/if}
	{#if form?.message}
		<div class="form-error" role="alert">{form.message}</div>
	{/if}

	<form
		method="POST"
		{action}
		use:enhance={async ({ formData }) => {
        if (resizedBlob) formData.set('image_file', resizedBlob, `cover_${Date.now()}.jpg`);
        return async ({ update }) => { await update(); };
    }}
		class="register-form"
		class:register-form--edit={isEditMode}
	>
		<div class="basic-column basic-column--left">
			<div class="form-row">
				<div class="form-group form-group--wide">
					<label for="rf-title">タイトル <span class="required">*</span></label>
					<input id="rf-title" name="title" type="text" required class="rf-input" value={anime?.title ?? ""}>
				</div>
				<div class="form-group form-group--wide">
					<label for="rf-title-en">英語タイトル</label>
					<input id="rf-title-en" name="title_en" type="text" class="rf-input" value={anime?.title_en ?? ""}>
				</div>
			</div>
			<div class="form-row">
				<div class="form-group form-group--wide">
					<label for="rf-romaji">ローマ字タイトル</label>
					<input
						id="rf-romaji"
						name="title_romaji"
						type="text"
						class="rf-input"
						value={anime?.title_romaji ?? ""}
					>
				</div>
				<div class="form-group">
					<label for="rf-season">シーズン（例: 2025春）</label>
					<input
						id="rf-season"
						name="season"
						type="text"
						placeholder="2025春"
						class="rf-input"
						value={anime?.season ?? ""}
					>
				</div>
				<div class="form-group form-group--narrow">
					<label for="rf-ep">話数</label>
					<input
						id="rf-ep"
						name="episode_count"
						type="number"
						min="1"
						class="rf-input"
						value={anime?.episode_count ?? ""}
					>
				</div>
			</div>

			<div class="form-group">
				<label for="rf-synopsis">あらすじ</label>
				<textarea
					id="rf-synopsis"
					name="synopsis"
					rows="4"
					class="rf-textarea"
					value={anime?.synopsis ?? ""}
				></textarea>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="rf-type">タイプ</label>
					<select id="rf-type" name="type" class="rf-select">
						<option value="">未設定</option>
						<option value="TV" selected={anime?.type === "TV"}>TV</option>
						<option value="映画" selected={anime?.type === "映画"}>映画</option>
						<option value="OVA" selected={anime?.type === "OVA"}>OVA</option>
						<option value="ONA" selected={anime?.type === "ONA"}>ONA</option>
						<option value="特別" selected={anime?.type === "特別"}>特別</option>
					</select>
				</div>
				<div class="form-group">
					<label for="rf-source">原作</label>
					<select id="rf-source" name="source" class="rf-select">
						<option value="">未設定</option>
						{#each SOURCE_OPTIONS as source}
							<option value={source} selected={anime?.source === source}>{source}</option>
						{/each}
					</select>
				</div>
				<div class="form-group">
					<label for="rf-room-type">ルーム種別</label>
					<select id="rf-room-type" name="room_type" class="rf-select">
						<option value="episode" selected={(anime?.room_type ?? "episode") === "episode"}>
							話数別ルーム
						</option>
						<option value="global" selected={anime?.room_type === "global"}>総合ロビー</option>
					</select>
				</div>
			</div>
		</div>

		<div class="basic-column basic-column--right">
			<div class="form-row">
				<div class="form-group">
					<label for="rf-aired-from">放送開始</label>
					<input
						id="rf-aired-from"
						name="aired_from"
						type="date"
						class="rf-input"
						value={dateValue(anime?.aired_from)}
					>
				</div>
				<div class="form-group">
					<label for="rf-aired-to">放送終了</label>
					<input
						id="rf-aired-to"
						name="aired_to"
						type="date"
						class="rf-input"
						value={dateValue(anime?.aired_to)}
					>
				</div>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="rf-broadcast-day">放送曜日</label>
					<select id="rf-broadcast-day" name="broadcast_day" class="rf-select">
						<option value="">未設定</option>
						<option value="0" selected={anime?.broadcast_day === 0}>日曜日</option>
						<option value="1" selected={anime?.broadcast_day === 1}>月曜日</option>
						<option value="2" selected={anime?.broadcast_day === 2}>火曜日</option>
						<option value="3" selected={anime?.broadcast_day === 3}>水曜日</option>
						<option value="4" selected={anime?.broadcast_day === 4}>木曜日</option>
						<option value="5" selected={anime?.broadcast_day === 5}>金曜日</option>
						<option value="6" selected={anime?.broadcast_day === 6}>土曜日</option>
					</select>
				</div>
				<div class="form-group">
					<label for="rf-broadcast-time">放送時刻 (JST)</label>
					<input
						id="rf-broadcast-time"
						name="broadcast_time"
						type="text"
						inputmode="numeric"
						pattern="([01]?[0-9]|2[0-9]|3[0-5]|4[0-7]):[0-5][0-9]"
						placeholder="例: 24:30 / 26:00"
						class="rf-input"
						value={anime?.broadcast_time ?? ""}
					>
				</div>
				<div class="form-group form-group--narrow">
					<label for="rf-broadcast-duration">放送枠 (分)</label>
					<input
						id="rf-broadcast-duration"
						name="broadcast_duration_minutes"
						type="number"
						min="1"
						max="1440"
						value={anime?.broadcast_duration_minutes ?? 30}
						class="rf-input"
					>
				</div>
			</div>

			<div class="form-group">
				<label for="rf-broadcast-station">放送局</label>
				<input
					id="rf-broadcast-station"
					type="text"
					name="broadcast_station"
					class="rf-input"
					placeholder="複数の場合はカンマ区切り（例: TBS, MX, AT-X）"
					value={broadcastStationValue}
				>
			</div>

			<div class="form-group">
				<span class="field-label">ジャンル</span>
				<div class="tag-picker">
					{#each GENRES as g}
						<button
							type="button"
							class="tag-btn"
							class:selected={selectedGenres.includes(g)}
							onclick={() => toggleGenre(g)}
						>
							{g}
						</button>
					{/each}
				</div>
				{#each selectedGenres as g}
					<input type="hidden" name="genre" value={g}>
				{/each}
			</div>

			<div class="form-group">
				<span class="field-label">スタジオ</span>
				<div class="tag-input-row">
					<input
						type="text"
						class="rf-input"
						placeholder="スタジオ名を入力"
						bind:value={studioInput}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(studios, studioInput, v => studios = v, () => studioInput = ''); } }}
					>
					<button
						type="button"
						class="tag-add-btn"
						onclick={() => addTag(studios, studioInput, v => studios = v, () => studioInput = '')}
					>
						追加
					</button>
				</div>
				<div class="tag-chips">
					{#each studios as s}
						<span class="tag-chip"
							>{s}
							<button
								type="button"
								class="chip-remove"
								onclick={() => removeTag(studios, s, v => studios = v)}
							>
								✕
							</button></span
						>
						<input type="hidden" name="studio" value={s}>
					{/each}
				</div>
			</div>

			<div class="form-group">
				<span class="field-label">プロデューサー / 制作</span>
				<div class="tag-input-row">
					<input
						type="text"
						class="rf-input"
						placeholder="プロデューサー名を入力"
						bind:value={producerInput}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(producers, producerInput, v => producers = v, () => producerInput = ''); } }}
					>
					<button
						type="button"
						class="tag-add-btn"
						onclick={() => addTag(producers, producerInput, v => producers = v, () => producerInput = '')}
					>
						追加
					</button>
				</div>
				<div class="tag-chips">
					{#each producers as p}
						<span class="tag-chip"
							>{p}
							<button
								type="button"
								class="chip-remove"
								onclick={() => removeTag(producers, p, v => producers = v)}
							>
								✕
							</button></span
						>
						<input type="hidden" name="producer" value={p}>
					{/each}
				</div>
			</div>

			<div class="form-group">
				<span class="field-label">公式ハッシュタグ</span>
				<div class="tag-input-row">
					<input
						type="text"
						class="rf-input"
						placeholder="#アニメタグ"
						bind:value={hashtagInput}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(hashtags, hashtagInput, v => hashtags = v, () => hashtagInput = ''); } }}
					>
					<button
						type="button"
						class="tag-add-btn"
						onclick={() => addTag(hashtags, hashtagInput, v => hashtags = v, () => hashtagInput = '')}
					>
						追加
					</button>
				</div>
				<div class="tag-chips">
					{#each hashtags as h}
						<span class="tag-chip"
							>#{h}
							<button
								type="button"
								class="chip-remove"
								onclick={() => removeTag(hashtags, h, v => hashtags = v)}
							>
								✕
							</button></span
						>
						<input type="hidden" name="official_hashtag" value={h}>
					{/each}
				</div>
			</div>

			<div class="form-row">
				<div class="form-group form-group--wide">
					<label for="rf-site">公式サイト URL</label>
					<input
						id="rf-site"
						name="official_site_url"
						type="url"
						class="rf-input"
						placeholder="https://..."
						value={anime?.official_site_url ?? ""}
					>
				</div>
				<div class="form-group form-group--wide">
					<label for="rf-x">公式 X (Twitter) URL</label>
					<input
						id="rf-x"
						name="official_x_url"
						type="url"
						class="rf-input"
						placeholder="https://x.com/..."
						value={anime?.official_x_url ?? ""}
					>
				</div>
			</div>

			<div class="form-row">
				<div class="form-group form-group--wide">
					<label for="rf-copyright">権利表記</label>
					<input
						id="rf-copyright"
						name="copyright"
						type="text"
						class="rf-input"
						value={anime?.copyright ?? ""}
					>
				</div>
				<div class="form-group form-group--wide">
					<span class="field-label">カバー画像</span>
					<label class="cover-upload-label" class:has-preview={!!imagePreview}>
						{#if imagePreview}
							<img src={imagePreview} alt="カバープレビュー" class="cover-preview">
							<span class="cover-change-hint">クリックして変更</span>
						{:else}
							<svg
								width="22"
								height="22"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								aria-hidden="true"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="17 8 12 3 7 8" />
								<line x1="12" y1="3" x2="12" y2="15" />
							</svg>
							<span class="cover-upload-hint"
								>{imageProcessing ? '処理中...' : '画像をアップロード（JPEG/PNG/WebP）'}</span
							>
						{/if}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp"
							onchange={handleFileChange}
							disabled={imageProcessing}
							class="cover-file-input"
						>
					</label>
					{#if !imageFile}
						<input
							id="rf-cover"
							name="cover_url"
							type="url"
							class="rf-input"
							style="margin-top:6px"
							placeholder="または画像 URL を直接入力..."
							value={anime?.cover_url ?? ""}
						>
					{/if}
				</div>
			</div>
		</div>

		<div class="form-actions">
			<button type="submit" class="submit-btn">{isEditMode ? "更新する" : "登録する"}</button>
			<a href={isEditMode && anime ? `/anime/${anime.id}` : "/anime"} class="cancel-link">キャンセル</a>
		</div>
	</form>
</div>

<style>
.register-section {
	max-width: 760px;
}
.register-section--edit {
	max-width: none;
}
.register-title {
	font-size: 1.1rem;
	font-weight: 700;
	margin-bottom: 20px;
	color: var(--color-text);
}
.form-success {
	padding: 12px 16px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--color-success) 10%, transparent);
	color: var(--color-success);
	margin-bottom: 16px;
	font-size: 0.9rem;
}
.form-success a {
	color: var(--color-success);
	font-weight: 600;
}
.form-error {
	padding: 12px 16px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--color-danger) 10%, transparent);
	color: var(--color-danger);
	margin-bottom: 16px;
	font-size: 0.9rem;
}
.register-form {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.register-form--edit {
	gap: 18px;
}
.basic-column {
	display: flex;
	flex-direction: column;
	gap: 16px;
	min-width: 0;
}
.form-row {
	display: flex;
	gap: 12px;
	flex-wrap: wrap;
}
.form-group {
	display: flex;
	flex-direction: column;
	gap: 5px;
	flex: 1 1 180px;
}
.basic-column > .form-group {
	flex: 0 1 auto;
}
.form-group--wide {
	flex: 2 1 240px;
}
.form-group--narrow {
	flex: 0 1 100px;
}
.form-group label,
.field-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-muted);
}
.required {
	color: var(--color-danger);
}
.rf-input,
.rf-textarea,
.rf-select {
	padding: 8px 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background: var(--color-surface);
	color: var(--color-text);
	font-size: 0.88rem;
	outline: none;
	transition: border-color 0.15s;
	width: 100%;
	box-sizing: border-box;
}
.rf-input:focus,
.rf-textarea:focus,
.rf-select:focus {
	border-color: var(--color-accent);
}
.rf-input:focus-visible,
.rf-textarea:focus-visible,
.rf-select:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
.rf-textarea {
	resize: vertical;
}

.tag-picker {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.tag-btn {
	padding: 4px 10px;
	border-radius: 14px;
	border: 1px solid var(--color-border);
	background: transparent;
	color: var(--color-text-muted);
	font-size: 0.8rem;
	cursor: pointer;
	transition: all 0.12s;
}
.tag-btn:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.tag-btn.selected {
	background: var(--color-accent);
	color: #fff;
	border-color: var(--color-accent);
}

.tag-input-row {
	display: flex;
	gap: 6px;
}
.tag-input-row .rf-input {
	flex: 1;
}
.tag-add-btn {
	padding: 8px 14px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background: var(--color-surface-hover);
	color: var(--color-text);
	font-size: 0.82rem;
	cursor: pointer;
	white-space: nowrap;
	transition: background 0.12s;
}
.tag-add-btn:hover {
	background: var(--color-accent);
	color: #fff;
	border-color: var(--color-accent);
}
.tag-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 6px;
}
.tag-chip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 3px 10px;
	border-radius: 14px;
	background: var(--color-accent);
	color: #fff;
	font-size: 0.8rem;
}
.chip-remove {
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	padding: 0;
	font-size: 0.75rem;
	line-height: 1;
	opacity: 0.7;
}
.chip-remove:hover {
	opacity: 1;
}

.form-actions {
	display: flex;
	align-items: center;
	gap: 16px;
	margin-top: 8px;
}
.submit-btn {
	padding: 10px 28px;
	border-radius: 8px;
	background: var(--color-accent);
	color: #fff;
	border: none;
	font-size: 0.9rem;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.15s;
}
.submit-btn:hover {
	opacity: 0.85;
}
.cancel-link {
	font-size: 0.85rem;
	color: var(--color-text-muted);
	text-decoration: none;
}
.cancel-link:hover {
	color: var(--color-text);
}

.cover-upload-label {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: 100%;
	height: 110px;
	border: 2px dashed var(--color-border);
	border-radius: 8px;
	cursor: pointer;
	transition:
		border-color 0.15s,
		background 0.15s;
	color: var(--color-text-muted);
	font-size: 0.82rem;
	overflow: hidden;
	position: relative;
}
.cover-upload-label:hover {
	border-color: var(--color-accent);
	background: var(--color-surface-hover);
}
.cover-upload-label.has-preview {
	height: 160px;
	border-style: solid;
	padding: 0;
}
.cover-preview {
	width: 100%;
	display: block;
	image-rendering: auto;
}
.cover-change-hint {
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	text-align: center;
	font-size: 0.75rem;
	color: #fff;
	background: rgba(0, 0, 0, 0.5);
	padding: 4px 0;
}
.cover-file-input {
	display: none;
}
.cover-upload-hint {
	text-align: center;
	padding: 0 8px;
	line-height: 1.4;
}

@media (min-width: 768px) {
	.register-form--edit {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: 16px 20px;
	}

	.register-form--edit .basic-column--left {
		grid-column: 1;
	}

	.register-form--edit .basic-column--right {
		grid-column: 2;
	}

	.register-form--edit .form-actions {
		grid-column: 1 / -1;
	}

	.register-form--edit .form-row {
		align-items: start;
	}
}
</style>
