/**
 * 値を変数に持たないフォームで、開いたときの内容から変わったかを知らせる。
 * 直す画面の「保存する」を、変更が無い間は押せなくするのに使う（ux-guidelines「色と強調」）。
 * 付いた時点の内容を基準にするので、保存したら閉じる（作り直される）フォームに付ける。
 * 入力欄が増減する（選んだ種類で欄が出る）場合も、その時点の内容どうしで比べる。
 */
export function trackFormChanges(form: HTMLFormElement, onchange: (changed: boolean) => void) {
	let notify = onchange;
	const initial = snapshot(form);
	// 選んだ種類で欄が出入りする画面は、その描き直しが済んでから比べる
	const handle = () => setTimeout(() => notify(snapshot(form) !== initial), 0);
	form.addEventListener("input", handle);
	form.addEventListener("change", handle);
	notify(false);
	return {
		update(next: (changed: boolean) => void) {
			notify = next;
		},
		destroy() {
			form.removeEventListener("input", handle);
			form.removeEventListener("change", handle);
		},
	};
}

function snapshot(form: HTMLFormElement): string {
	return JSON.stringify([...new FormData(form).entries()].filter(([, value]) => typeof value === "string"));
}
