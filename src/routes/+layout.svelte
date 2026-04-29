<script lang="ts">
    import { onMount } from 'svelte';
    import { invalidate } from '$app/navigation';
    import Nav from '$lib/components/Nav.svelte';
    import Sidebar from '$lib/components/Sidebar.svelte';
    import type { LayoutProps } from './$types';
    import '../app.css';

    let { data, children }: LayoutProps = $props();

    onMount(() => {
        const {
            data: { subscription },
        } = data.supabase.auth.onAuthStateChange(() => {
            invalidate('supabase:auth');
        });
        return () => subscription.unsubscribe();
    });
</script>

<div class="app-layout">
    <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
    <Sidebar supabase={data.supabase as any} session={data.session} profile={data.profile} unreadNotificationCount={data.unreadNotificationCount} />
    <div class="app-main">
        <Nav />
        {@render children()}
    </div>
</div>
