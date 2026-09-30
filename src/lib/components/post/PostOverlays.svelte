<script lang="ts">
import { enhance } from "$app/forms";
import { trapFocus } from "$lib/actions/trapFocus";
import AnimeExchangeResult from "$lib/components/AnimeExchangeResult.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { PostController } from "./post-controller.svelte";

interface Props {
	controller: PostController;
	/** Post text as displayed, shown in the quote preview. */
	content: string;
}

let { controller, content }: Props = $props();

const post = $derived(controller.post);
let deleteFormEl = $state<HTMLFormElement | null>(null);

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") controller.closeOverlays();
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if controller.isOwn}
	<form
		method="POST"
		action="?/deletePost"
		use:enhance={controller.handleDelete}
		bind:this={deleteFormEl}
		style="display:none"
	>
		<input type="hidden" name="post_id" value={post.id}>
	</form>
{/if}

{#if controller.quoteModalOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
	<div
		class="quote-modal-overlay"
		role="presentation"
		onclick={({ target, currentTarget }) => { if (target === currentTarget) controller.closeQuoteModal(); }}
	>
		<div
			class="quote-modal-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="quote-modal-title"
			tabindex="-1"
			use:trapFocus
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="quote-modal-header">
				<span id="quote-modal-title" class="quote-modal-title">引用リポスト</span>
				<button
					type="button"
					class="quote-modal-close"
					aria-label="閉じる"
					onclick={() => controller.closeQuoteModal()}
				>
					✕
				</button>
			</div>
			<div class="quote-modal-body">
				<textarea
					class="quote-modal-textarea"
					placeholder="コメントを追加..."
					rows="3"
					bind:value={controller.quoteText}
					disabled={controller.quoteSubmitting}
				></textarea>
				<div class="quote-preview">
					<div class="quote-preview-header">
						<UserAvatar src={post.avatar_url} username={post.username} size="sm" />
						<span class="quote-preview-name">{post.display_name || post.username}</span>
						<span class="quote-preview-at">@{post.username}</span>
					</div>
					<p class="quote-preview-content">{content}</p>
				</div>
				{#if controller.quoteError}
					<p class="flash-error" role="alert" style="margin-top:8px;">{controller.quoteError}</p>
				{/if}
			</div>
			<div class="quote-modal-footer">
				<button
					type="button"
					class="btn btn-primary"
					disabled={!controller.quoteText.trim() || controller.quoteSubmitting}
					onclick={() => controller.submitQuoteRepost()}
				>
					{controller.quoteSubmitting ? '投稿中…' : 'リポスト'}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if controller.exchangeModalOpen && post.exchange_share}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="exchange-result-modal-overlay"
		role="presentation"
		onclick={(e) => { e.stopPropagation(); controller.exchangeModalOpen = false; }}
	>
		<div
			class="exchange-result-modal-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="exchange-result-modal-title"
			tabindex="-1"
			use:trapFocus
			onclick={(e) => e.stopPropagation()}
		>
			<div class="exchange-result-modal-header">
				<span id="exchange-result-modal-title" class="exchange-result-modal-title">トレード結果</span>
				<button
					type="button"
					class="exchange-result-modal-close"
					aria-label="閉じる"
					onclick={() => (controller.exchangeModalOpen = false)}
				>
					✕
				</button>
			</div>
			<div class="exchange-result-modal-body">
				<AnimeExchangeResult
					offeredAnime={post.exchange_share.offered_anime}
					receivedAnime={post.exchange_share.received_anime}
					offeredComment={post.exchange_share.offered_comment}
					receivedComment={post.exchange_share.received_comment}
					offeredSubjectiveTags={post.exchange_share.offered_subjective_tags}
					receivedSubjectiveTags={post.exchange_share.received_subjective_tags}
					framed={false}
				/>
			</div>
			<div class="exchange-result-modal-footer">
				<a href="/exchange" class="exchange-result-modal-link">トレードタブへ</a>
			</div>
		</div>
	</div>
{/if}

{#if controller.lightboxUrl}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="lightbox-overlay"
		onclick={(e) => { e.stopPropagation(); controller.lightboxUrl = null; }}
		role="dialog"
		aria-modal="true"
		aria-label="画像拡大表示"
		tabindex="-1"
		use:trapFocus
	>
		<button type="button" class="lightbox-content" onclick={(e) => e.stopPropagation()} aria-label="拡大画像">
			<img src={controller.lightboxUrl} alt="拡大画像" class="lightbox-image">
		</button>
		<button
			type="button"
			class="lightbox-close"
			onclick={() => (controller.lightboxUrl = null)}
			aria-label="閉じる"
		>
			✕
		</button>
	</div>
{/if}

{#if controller.reportModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="report-modal-overlay"
		role="presentation"
		onclick={(e) => { e.stopPropagation(); controller.reportModalOpen = false; }}
	>
		<div
			class="report-modal-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="report-modal-title"
			tabindex="-1"
			use:trapFocus
			onclick={(e) => e.stopPropagation()}
		>
			<div class="report-modal-header">
				<span id="report-modal-title" class="report-modal-title">投稿を通報</span>
				<button
					type="button"
					class="report-modal-close"
					aria-label="閉じる"
					onclick={() => (controller.reportModalOpen = false)}
				>
					✕
				</button>
			</div>
			<div class="report-modal-body">
				<label class="report-field">
					<span>理由</span>
					<select bind:value={controller.reportReason}>
						<option value="spam">スパム</option>
						<option value="harassment">嫌がらせ</option>
						<option value="sexual">性的コンテンツ</option>
						<option value="violence">暴力的コンテンツ</option>
						<option value="illegal">違法・危険行為</option>
						<option value="other">その他</option>
					</select>
				</label>
				<label class="report-field">
					<span>補足</span>
					<textarea rows="3" maxlength="500" bind:value={controller.reportDetails}></textarea>
				</label>
				{#if controller.reportMessage}
					<p class="report-message" role="status" aria-live="polite">{controller.reportMessage}</p>
				{/if}
			</div>
			<div class="report-modal-footer">
				<button
					type="button"
					class="btn btn-primary"
					disabled={controller.reportSubmitting}
					onclick={() => controller.submitReport()}
				>
					{controller.reportSubmitting ? '送信中...' : '送信'}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if controller.deleteModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="delete-modal-overlay"
		role="presentation"
		onclick={(e) => { e.stopPropagation(); controller.deleteModalOpen = false; }}
	>
		<div
			class="delete-modal-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-modal-title"
			tabindex="-1"
			use:trapFocus
			onclick={(e) => e.stopPropagation()}
		>
			<div class="delete-modal-header">
				<span id="delete-modal-title" class="delete-modal-title">投稿を削除</span>
			</div>
			<div class="delete-modal-body">
				{#if controller.deleteError}
					<p class="flash-error" role="alert">{controller.deleteError}</p>
				{/if}
				<p>この投稿を削除しますか？この操作は取り消せません。</p>
			</div>
			<div class="delete-modal-footer">
				<button type="button" class="btn btn-ghost" onclick={() => (controller.deleteModalOpen = false)}>
					キャンセル
				</button>
				<button
					type="button"
					class="btn btn-danger"
					disabled={controller.deleting}
					onclick={() => deleteFormEl?.requestSubmit()}
				>
					削除する
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
.delete-modal-overlay,
.report-modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgba(0, 0, 0, 0.58);
	backdrop-filter: blur(3px);
}

.delete-modal-card,
.report-modal-card {
	width: min(360px, 100%);
	border: 1px solid var(--color-border);
	border-radius: 18px;
	background: var(--color-bg-card);
	box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}

.report-modal-card {
	width: min(420px, 100%);
}

.delete-modal-header {
	padding: 16px 16px 0;
}

.delete-modal-title,
.report-modal-title {
	font-size: 15px;
	font-weight: 800;
}

.delete-modal-body {
	padding: 12px 16px 16px;
	color: var(--color-text-secondary);
	font-size: 14px;
}

.delete-modal-body p {
	margin: 0;
}

.delete-modal-footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
	padding: 12px 16px;
	border-top: 1px solid var(--color-border);
}

.report-modal-header,
.report-modal-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 16px;
	border-bottom: 1px solid var(--color-border);
}

.report-modal-footer {
	justify-content: flex-end;
	border-top: 1px solid var(--color-border);
	border-bottom: 0;
}

.report-modal-close {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 12px;
	color: var(--color-text-muted);
}

.report-modal-close:hover {
	background: var(--color-bg-hover);
	color: var(--color-text);
}

.report-modal-body {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px;
}

.report-field {
	display: flex;
	flex-direction: column;
	gap: 6px;
	color: var(--color-text-muted);
	font-size: 13px;
	font-weight: 700;
}

.report-field select,
.report-field textarea {
	width: 100%;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-bg);
	color: var(--color-text);
	padding: 9px 10px;
	font-weight: 400;
}

.report-field textarea {
	resize: vertical;
}

.report-message {
	margin: 0;
	color: var(--color-text-secondary);
	font-size: 13px;
}
</style>
