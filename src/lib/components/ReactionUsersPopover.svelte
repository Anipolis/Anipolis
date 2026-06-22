<script lang="ts">
import type { ReactionUser } from "$lib/types";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	title: string;
	users: ReactionUser[];
	loading: boolean;
	errorMessage: string;
	onClose: () => void;
}

let { title, users, loading, errorMessage, onClose }: Props = $props();
</script>

<button type="button" class="reaction-popover-backdrop" aria-label="一覧を閉じる" onclick={onClose}></button>
<div class="reaction-popover" role="dialog" aria-label={title} tabindex="-1">
	<header class="reaction-popover-header">
		<strong>{title}</strong>
		<button type="button" class="reaction-popover-close" aria-label="閉じる" onclick={onClose}>
			<span class="i-lucide-x" aria-hidden="true"></span>
		</button>
	</header>
	<div class="reaction-popover-list">
		{#if loading}
			<p class="reaction-popover-status">読み込み中...</p>
		{:else if errorMessage}
			<p class="reaction-popover-status reaction-popover-error">{errorMessage}</p>
		{:else if users.length === 0}
			<p class="reaction-popover-status">ユーザーはいません</p>
		{:else}
			{#each users as user (user.user_id)}
				<a href="/profile/{user.username}" class="reaction-user">
					<UserAvatar src={user.avatar_url} username={user.username} size="sm" />
					<span class="reaction-user-names">
						<strong>{user.display_name || user.username}</strong>
						<span>@{user.username}</span>
					</span>
				</a>
			{/each}
		{/if}
	</div>
</div>
