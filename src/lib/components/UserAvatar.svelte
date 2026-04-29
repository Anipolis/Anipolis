<script lang="ts">
    interface Props {
        src: string | null | undefined;
        username: string;
        size?: 'sm' | 'md' | 'lg';
    }

    let { src, username, size = 'md' }: Props = $props();

    const initial = $derived(username ? (username[0] ?? '?').toUpperCase() : '?');
</script>

<div class="avatar avatar-{size}" aria-label={username}>
    {#if src}
        <img {src} alt={username} referrerpolicy="no-referrer" />
    {:else}
        {initial}
    {/if}
</div>
