<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { charCountClass } from "$lib/utils/format";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	username: string;
	avatarUrl: string | null | undefined;
}

let { username, avatarUrl }: Props = $props();

const MAX_LENGTH = 280;
const MAX_IMAGES = 4;

let content = $state("");
let submitting = $state(false);
let errorMessage = $state("");
let imageUrls = $state<string[]>([]);
let uploading = $state(false);
let fileInput = $state<HTMLInputElement | null>(null);

const remaining = $derived(MAX_LENGTH - content.length);
const countClass = $derived(charCountClass(content.length, MAX_LENGTH));
const canSubmit = $derived(
	(content.trim().length > 0 || imageUrls.length > 0) && content.length <= MAX_LENGTH && !submitting && !uploading,
);

async function handleFileChange(e: Event) {
	const input = e.target as HTMLInputElement;
	const files = Array.from(input.files ?? []);
	if (files.length === 0) return;

	const remaining_slots = MAX_IMAGES - imageUrls.length;
	const toUpload = files.slice(0, remaining_slots);

	uploading = true;
	errorMessage = "";

	for (const file of toUpload) {
		const fd = new FormData();
		fd.append("file", file);
		try {
			const res = await fetch("/api/upload", { method: "POST", body: fd });
			if (!res.ok) {
				const msg = await res.text();
				errorMessage = msg || "アップロードに失敗しました";
				break;
			}
			const { url } = await res.json();
			imageUrls = [...imageUrls, url];
		} catch {
			errorMessage = "アップロードに失敗しました";
			break;
		}
	}

	uploading = false;
	// reset input so same file can be re-selected
	input.value = "";
}

function removeImage(index: number) {
	imageUrls = imageUrls.filter((_, i) => i !== index);
}

const handleSubmit: SubmitFunction = () => {
	submitting = true;
	errorMessage = "";
	return async ({ result, update }) => {
		submitting = false;
		if (result.type === "failure") {
			errorMessage = (result.data as { message?: string })?.message ?? "投稿に失敗しました";
		} else {
			content = "";
			imageUrls = [];
			await update();
		}
	};
};
</script>

<div class="composer">
	<div class="composer-body">
		<UserAvatar src={avatarUrl} {username} size="md" />
		<form
			method="POST"
			action="?/createPost"
			use:enhance={handleSubmit}
			style="flex:1; display:flex; flex-direction:column; gap:0;"
		>
			<textarea
				name="content"
				class="composer-textarea"
				placeholder="いま何してる？"
				rows="3"
				bind:value={content}
				maxlength={MAX_LENGTH + 10}
			></textarea>

			<!-- 画像プレビュー -->
			{#if imageUrls.length > 0}
				<div class="composer-image-previews">
					{#each imageUrls as url, i}
						<div class="composer-image-preview">
							<img src={url} alt="添付画像 {i + 1}">
							<button
								type="button"
								class="composer-image-remove"
								onclick={() => removeImage(i)}
								aria-label="画像を削除"
							>
								✕
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- 画像URLをフォームに含める -->
			<input type="hidden" name="image_urls" value={JSON.stringify(imageUrls)}>

			{#if errorMessage}
				<p class="flash-error" style="margin-top:8px;">{errorMessage}</p>
			{/if}

			<div class="composer-footer">
				<!-- 画像添付ボタン -->
				<button
					type="button"
					class="composer-image-btn"
					disabled={imageUrls.length >= MAX_IMAGES || uploading}
					onclick={() => fileInput?.click()}
					aria-label="画像を添付"
					title="画像を添付（最大{MAX_IMAGES}枚）"
				>
					{#if uploading}
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path
								d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
							/>
						</svg>
					{:else}
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
							<circle cx="8.5" cy="8.5" r="1.5" />
							<polyline points="21 15 16 10 5 21" />
						</svg>
					{/if}
				</button>

				<input
					bind:this={fileInput}
					type="file"
					accept="image/jpeg,image/png,image/gif,image/webp"
					multiple
					style="display:none"
					onchange={handleFileChange}
				>

				<span class="char-count {countClass}">{remaining}</span>
				<button type="submit" class="btn btn-primary" disabled={!canSubmit}>
					{submitting ? '投稿中…' : '投稿'}
				</button>
			</div>
		</form>
	</div>
</div>
