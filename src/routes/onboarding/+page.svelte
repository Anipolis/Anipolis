<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let username = $state(untrack(() => data.username ?? ""));
let displayName = $state(untrack(() => data.displayName ?? ""));
let submitting = $state(false);

const onSubmit: SubmitFunction = () => {
	submitting = true;
	return async ({ update }) => {
		submitting = false;
		await update({ reset: false });
	};
};
</script>

<svelte:head><title>プロフィールの設定 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">ようこそ！プロフィールを設定しましょう</h1>
			</div>

			<p class="field-hint" style="margin-bottom: 1.25rem;">
				ユーザー名と表示名は仮の値が設定されています。あとから設定画面でいつでも変更できます。
			</p>

			{#if form && "message" in form && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<form method="POST" action="?/save" use:enhance={onSubmit}>
				<div class="field">
					<label for="username" class="field-label">
						ユーザー名<span class="field-required">必須</span>
					</label>
					<div class="field-input-prefix">
						<span class="prefix">@</span>
						<input
							id="username"
							name="username"
							type="text"
							class="field-input has-prefix"
							class:field-error={form && "field" in form && form.field === "username"}
							placeholder="animetaro"
							maxlength="20"
							pattern={"[a-zA-Z0-9_]{3,20}"}
							required
							bind:value={username}
						>
					</div>
					{#if form && "field" in form && form.field === "username"}
						<p class="field-error-msg">{form.message}</p>
					{:else}
						<p class="field-hint">3〜20文字の半角英数字・アンダースコアのみ使用できます。</p>
					{/if}
				</div>

				<div class="field">
					<label for="display_name" class="field-label">表示名</label>
					<input
						id="display_name"
						name="display_name"
						type="text"
						class="field-input"
						class:field-error={form && "field" in form && form.field === "display_name"}
						placeholder="アニメ太郎"
						maxlength="50"
						bind:value={displayName}
					>
					{#if form && "field" in form && form.field === "display_name"}
						<p class="field-error-msg">{form.message}</p>
					{:else}
						<p class="field-hint">空欄の場合はユーザー名が表示名として使われます。</p>
					{/if}
				</div>

				<div class="settings-actions">
					<!-- save を DOM 先頭に置き Enter 既定の送信先にする。視覚順は order で調整 -->
					<button type="submit" class="btn btn-primary" style="order: 2;" disabled={submitting}>
						{submitting ? "保存中..." : "はじめる"}
					</button>
					<button
						type="submit"
						formaction="?/skip"
						class="btn btn-ghost"
						style="order: 1;"
						disabled={submitting}
					>
						あとで設定する
					</button>
				</div>
			</form>
		</div>
	</main>
</div>
