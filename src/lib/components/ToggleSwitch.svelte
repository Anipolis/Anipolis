<script lang="ts">
type Props = {
	name: string;
	checked: boolean;
	disabled?: boolean;
	label: string;
	onchange?: (event: Event) => void;
};

let { name, checked = $bindable(), disabled = false, label, onchange }: Props = $props();
</script>

<span class="toggle-switch" class:disabled>
	<input
		type="checkbox"
		role="switch"
		{name}
		bind:checked
		{disabled}
		aria-label={label}
		aria-checked={checked}
		{onchange}
	>
	<span class="track" aria-hidden="true">
		<span class="knob"></span>
	</span>
</span>

<style>
.toggle-switch {
	position: relative;
	display: inline-flex;
	flex-shrink: 0;
}
.toggle-switch input {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	margin: 0;
	opacity: 0;
	cursor: pointer;
}
.toggle-switch.disabled input {
	cursor: default;
}
.track {
	display: inline-flex;
	align-items: center;
	width: 44px;
	height: 24px;
	padding: 3px;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-text-muted) 35%, transparent);
	transition: background 0.18s ease;
}
.knob {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 1px 3px rgb(0 0 0 / 35%);
	transition: transform 0.18s ease;
}
.toggle-switch input:checked + .track {
	background: var(--color-accent);
}
.toggle-switch input:checked + .track .knob {
	transform: translateX(20px);
}
.toggle-switch input:focus-visible + .track {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
.toggle-switch.disabled .track {
	opacity: 0.55;
}
</style>
