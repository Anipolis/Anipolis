<script lang="ts">
/**
 * 表示／非表示を切り替えられるパスワード欄（#420）。
 * 打ち間違いを確かめて直せるようにする。見た目は app.css の .password-input-wrap / .password-toggle。
 */
interface Props {
	id: string;
	name: string;
	autocomplete: "current-password" | "new-password";
	required?: boolean;
	minlength?: number;
	invalid?: boolean;
	describedby?: string;
	/** 送信に失敗したときにフォーカスを戻すための要素 */
	input?: HTMLInputElement | null;
}

let {
	id,
	name,
	autocomplete,
	required = false,
	minlength,
	invalid = false,
	describedby,
	input = $bindable(null),
}: Props = $props();

let visible = $state(false);
</script>

<div class="password-input-wrap">
	<input
		bind:this={input}
		{id}
		{name}
		type={visible ? "text" : "password"}
		class="field-input password-input"
		class:field-error={invalid}
		{autocomplete}
		{required}
		{minlength}
		aria-invalid={invalid ? "true" : undefined}
		aria-describedby={describedby}
	>
	<button
		type="button"
		class="password-toggle"
		aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
		title={visible ? "パスワードを隠す" : "パスワードを表示"}
		aria-pressed={visible}
		onclick={() => {
			visible = !visible;
		}}
	>
		<span class={visible ? "i-lucide-eye-off" : "i-lucide-eye"} aria-hidden="true"></span>
	</button>
</div>
