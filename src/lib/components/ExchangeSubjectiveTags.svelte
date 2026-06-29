<script lang="ts">
interface Props {
	tags?: readonly string[] | null;
	compact?: boolean;
}

let { tags = [], compact = false }: Props = $props();

const visibleTags = $derived((tags ?? []).map((tag) => tag.trim()).filter(Boolean));
</script>

{#if visibleTags.length > 0}
	<div class="exchange-subjective-tags" class:exchange-subjective-tags--compact={compact}>
		{#each visibleTags as tag}
			<span>{tag}</span>
		{/each}
	</div>
{/if}

<style>
.exchange-subjective-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	margin-top: 6px;
}

.exchange-subjective-tags span {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 2px 7px;
	border: 1px solid color-mix(in srgb, var(--color-accent) 38%, var(--color-border));
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	color: var(--color-accent);
	font-size: 0.72rem;
	font-weight: 800;
	line-height: 1.35;
}

.exchange-subjective-tags--compact {
	gap: 4px;
}

.exchange-subjective-tags--compact span {
	min-height: 20px;
	padding: 1px 6px;
	font-size: 0.68rem;
}
</style>
