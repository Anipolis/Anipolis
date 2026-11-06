import { afterEach, describe, expect, it, vi } from "vitest";
import { trackFormChanges } from "./trackFormChanges";

function makeForm() {
	const form = document.body.appendChild(document.createElement("form"));
	form.innerHTML = `
		<input name="title" value="元の題名">
		<label><input type="radio" name="kind" value="a" checked></label>
		<label><input type="radio" name="kind" value="b"></label>
	`;
	return form;
}

const fire = (el: Element, type: "input" | "change") => el.dispatchEvent(new Event(type, { bubbles: true }));

describe("trackFormChanges", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.useRealTimers();
	});

	it("付いた時点では変更なし、変えたら変更あり、戻したら変更なしと知らせる", () => {
		vi.useFakeTimers();
		const form = makeForm();
		const onchange = vi.fn();
		const action = trackFormChanges(form, onchange);
		expect(onchange).toHaveBeenLastCalledWith(false);

		const title = form.querySelector<HTMLInputElement>('[name="title"]');
		if (!title) throw new Error("no input");
		title.value = "新しい題名";
		fire(title, "input");
		vi.runAllTimers();
		expect(onchange).toHaveBeenLastCalledWith(true);

		title.value = "元の題名";
		fire(title, "input");
		vi.runAllTimers();
		expect(onchange).toHaveBeenLastCalledWith(false);
		action.destroy();
	});

	it("選び直しも変更として扱う", () => {
		vi.useFakeTimers();
		const form = makeForm();
		const onchange = vi.fn();
		trackFormChanges(form, onchange);
		const b = form.querySelector<HTMLInputElement>('[value="b"]');
		if (!b) throw new Error("no radio");
		b.checked = true;
		fire(b, "change");
		vi.runAllTimers();
		expect(onchange).toHaveBeenLastCalledWith(true);
	});

	it("外したあとは知らせない", () => {
		vi.useFakeTimers();
		const form = makeForm();
		const onchange = vi.fn();
		trackFormChanges(form, onchange).destroy();
		onchange.mockClear();
		fire(form.querySelector('[name="title"]') as Element, "input");
		vi.runAllTimers();
		expect(onchange).not.toHaveBeenCalled();
	});
});
