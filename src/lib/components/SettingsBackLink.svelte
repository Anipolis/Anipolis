<script lang="ts">
import { page } from "$app/state";

const backHref = $derived.by(() => {
	const path = page.url.pathname;
	if (path.startsWith("/settings/account/password")) return "/settings?section=login";
	if (path.startsWith("/settings/passkeys") || path.startsWith("/settings/security"))
		return "/settings?section=login";
	if (path.startsWith("/settings/account") || path.startsWith("/settings/invites"))
		return "/settings?section=account";
	if (path.startsWith("/settings/mutes") || path.startsWith("/settings/blocks")) return "/settings?section=mute";
	if (path.startsWith("/settings/rooms")) return "/settings?section=notify";
	return "/settings?section=visibility";
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
