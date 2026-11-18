<script lang="ts">
import UserAvatar from "#lib/components/UserAvatar.svelte";
import type { FollowSuggestion } from "#lib/types.ts";
import { enhance } from "$app/forms";

/**
 * フォローのおすすめ（203）。理由は「共通の作品: 〇〇」、共通の作品が無い人は「最近よく投稿しています」。
 * その場でフォローできる。フォローしても一覧から消さない（押し間違えたらもう一度押して外せる）。
 * 置くページの ?/follow（toggleFollowAction）を使う
 */
interface Props {
	suggestions: FollowSuggestion[];
}

let { suggestions }: Props = $props();

type FollowState = "none" | "followed" | "pending";
let states = $state<Record<string, FollowState>>({});
let processing = $state<Record<string, boolean>>({});
let errorMessage = $state<string | null>(null);

function reasonOf(suggestion: FollowSuggestion): string {
	if (suggestion.sharedCount === 0) return "最近よく投稿しています";
	const rest = suggestion.sharedCount - suggestion.sharedTitles.length;
	return `共通の作品: ${suggestion.sharedTitles.join("、")}${rest > 0 ? ` ほか${rest}作品` : ""}`;
}
</script>

<ul class="follow-suggestions">
	{#each suggestions as suggestion (suggestion.id)}
		{@const followState = states[suggestion.id] ?? "none"}
		<li class="follow-suggestion">
			<a href="/profile/{suggestion.username}" class="follow-suggestion-user">
				<UserAvatar src={suggestion.avatarUrl} username={suggestion.username} size="md" />
				<span class="follow-suggestion-info">
					<span class="follow-suggestion-name">{suggestion.displayName ?? suggestion.username}</span>
					<span class="follow-suggestion-username">@{suggestion.username}</span>
					<span class="follow-suggestion-reason">{reasonOf(suggestion)}</span>
				</span>
			</a>
			<form
				method="POST"
				action="?/follow"
				use:enhance={({ cancel }) => {
					if (processing[suggestion.id]) {
						cancel();
						return;
					}
					processing[suggestion.id] = true;
					errorMessage = null;
					// ホーム全体は読み直さない（読み直すと、フォローした時点でおすすめが消える）
					return async ({ result }) => {
						processing[suggestion.id] = false;
						if (result.type === "success" && result.data) {
							const payload = result.data as { followed: boolean; requestStatus?: "none" | "pending" };
							states[suggestion.id] = payload.followed
								? "followed"
								: payload.requestStatus === "pending"
									? "pending"
									: "none";
						} else if (result.type === "failure") {
							const message = (result.data as { message?: string } | undefined)?.message;
							errorMessage = message ?? "フォローできませんでした";
						} else {
							errorMessage = "フォローできませんでした";
						}
					};
				}}
			>
				<input type="hidden" name="target_id" value={suggestion.id}>
				<button
					type="submit"
					class="btn {followState === "none" ? "btn-primary" : "btn-secondary"} follow-suggestion-button"
					disabled={processing[suggestion.id] || followState === "pending"}
					aria-label="{suggestion.displayName ?? suggestion.username}さんを{followState === "followed"
						? "フォロー中（押すと解除）"
						: followState === "pending"
							? "フォロー申請中"
							: "フォローする"}"
				>
					{followState === "followed" ? "フォロー中" : followState === "pending" ? "申請中" : "フォローする"}
				</button>
			</form>
		</li>
	{/each}
</ul>
{#if errorMessage}
	<p class="field-error-msg" role="alert">{errorMessage}</p>
{/if}

<style>
.follow-suggestions {
	display: flex;
	flex-direction: column;
	margin: 0;
	padding: 0;
	list-style: none;
}

.follow-suggestion {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 0;
	border-top: 1px solid var(--color-border);
}

.follow-suggestion:first-child {
	border-top: 0;
}

.follow-suggestion-user {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 12px;
	min-width: 0;
	color: inherit;
	text-decoration: none;
}

.follow-suggestion-info {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.follow-suggestion-name,
.follow-suggestion-username,
.follow-suggestion-reason {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.follow-suggestion-name {
	font-size: 14px;
	font-weight: 600;
}

.follow-suggestion-user:hover .follow-suggestion-name {
	text-decoration: underline;
}

.follow-suggestion-username,
.follow-suggestion-reason {
	font-size: 12px;
	color: var(--color-text-muted);
}

.follow-suggestion-button {
	flex: none;
	font-size: 13px;
}
</style>
