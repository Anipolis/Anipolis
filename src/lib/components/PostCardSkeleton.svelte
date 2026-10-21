<script lang="ts">
</script>

<div class="skeleton-row" aria-hidden="true">
	<div class="skeleton skeleton-circle"></div>
	<div class="skeleton skeleton-name"></div>
	<div class="skeleton skeleton-content"></div>
</div>
<style>
.skeleton-row {
	display: grid;
	grid-template-columns: 28px 100px minmax(0, 1fr);
	gap: 10px;
	align-items: center;
	min-height: 46px;
	padding: 5px 12px;
}
.skeleton-circle {
	width: 28px;
	height: 28px;
}
.skeleton-name {
	width: 72px;
	height: 12px;
}
.skeleton-content {
	width: 68%;
	height: 14px;
}
@media (max-width: 640px) {
	.skeleton-row {
		grid-template-columns: 28px minmax(0, 1fr);
		padding: 8px 10px;
	}
	.skeleton-content {
		grid-column: 2;
	}
}
</style>
