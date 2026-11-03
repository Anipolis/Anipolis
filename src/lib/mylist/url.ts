import { replaceState } from "$app/navigation";
import { page } from "$app/state";

/** マイリストの表示の設定を URL に残す。既定の値のときはパラメータを消す（履歴は増やさない） */
export function replaceMylistParam(name: "status" | "sort", value: string, defaultValue: string) {
	const url = new URL(location.href);
	if (value === defaultValue) url.searchParams.delete(name);
	else url.searchParams.set(name, value);
	replaceState(url, page.state);
}
