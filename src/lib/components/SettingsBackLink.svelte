<script lang="ts">
import { page } from "$app/state";

const backHref = $derived.by(() => {
	const path = page.url.pathname;
	if (path.startsWith("/settings/account")) return "/settings?section=account";
	if (path.startsWith("/settings/rooms")) return "/settings?section=rooms";
	return "/settings?section=privacy";
});
</script>

<a href={backHref} class="btn btn-ghost settings-back-link" aria-label="設定メニューへ戻る">
	<span class="i-lucide-arrow-left" aria-hidden="true"></span>
	戻る
</a>

<style>
.settings-back-link {
	margin-bottom: 16px;
}
</style>
