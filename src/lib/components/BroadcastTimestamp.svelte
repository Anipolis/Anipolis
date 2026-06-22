<script lang="ts">
interface Props {
	relativeTime: string;
	absoluteTime: string;
}
let { relativeTime, absoluteTime }: Props = $props();
</script>

<span class="flex items-center gap-2">
	<span
		class="broadcast-ts-badge rounded border border-teal-500/20 bg-slate-800/80 px-2 py-0.5 font-mono text-xs font-bold text-teal-400"
	>
		{relativeTime}
	</span>
	<span class="broadcast-ts-abs text-xs text-gray-500">({absoluteTime})</span>
</span>
