import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn() }));

import type { Anime } from "$lib/types";
import AnimeRegisterForm from "./AnimeRegisterForm.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

function renderForm(anime: Partial<Anime>) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(AnimeRegisterForm, {
		target,
		props: { form: null, mode: "edit", anime: { title: "テスト", ...anime } as Anime, action: "?/updateAnime" },
	});
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

// ブラウザは selected 属性の付いた option を初期選択にする（happy-dom は後から足した
// option の選択状態を正しく計算しないため、select.value ではなく属性で確かめる）
function selectedValue(target: HTMLElement, name: string) {
	return target.querySelector<HTMLOptionElement>(`select[name="${name}"] option[selected]`)?.value;
}

describe("作品情報の編集フォーム", () => {
	it("カタログの英語表記のタイプ（映画・特別）を選択した状態で開く", () => {
		expect(selectedValue(renderForm({ type: "Movie" }), "type")).toBe("Movie");
	});

	it("選択肢に無いタイプ・原作も保存で消えないよう、そのまま選択しておく", () => {
		const target = renderForm({ type: "TV Special", source: "Web novel" });
		expect(selectedValue(target, "type")).toBe("TV Special");
		expect(selectedValue(target, "source")).toBe("Web novel");
	});
});
