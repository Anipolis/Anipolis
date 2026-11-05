import type { SubmitFunction } from "@sveltejs/kit";
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LiveRoomData } from "$lib/types/live-room";
import LiveRoomView from "./LiveRoomView.svelte";

const submitters = vi.hoisted(() => new Map<string, unknown>());

vi.mock("$app/forms", () => ({
	enhance: (form: HTMLFormElement, submit: unknown) => {
		submitters.set(form.getAttribute("action") ?? "", submit);
		return { destroy() {} };
	},
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

const channel = {
	on() {
		return this;
	},
	subscribe() {
		return this;
	},
};
const data: LiveRoomData = {
	supabase: { channel: () => channel, removeChannel: async () => "ok" } as unknown as LiveRoomData["supabase"],
	anime: null,
	room: {
		session_id: "test",
		date: "2026-09-08",
		kind: "global",
		hashtag: "test",
		scheduled_at: "2026-09-08T00:00:00Z",
		posting_opens_at: "2020-01-01T00:00:00Z",
		posting_closes_at: "2099-01-01T00:00:00Z",
		duration_minutes: null,
		title: "テスト",
	},
	posts: [],
	trending: [],
	animeTrending: [],
	user: {
		id: "test",
		aud: "authenticated",
		app_metadata: {},
		user_metadata: {},
		created_at: "2026-09-08T00:00:00Z",
	},
	roomExperiment: { enabled: false },
	roomExitSurvey: { experimentRunId: null, alreadyAnswered: false, postCount: 0, surveyVersion: "test" },
};

type Finish = (input: { result: unknown; update: () => Promise<void> }) => Promise<void>;
const update = async () => {};

/** 投稿を送り始める。送った内容と、応答を返す関数を返す */
const startPost = () => {
	const formData = new FormData();
	formData.set("content", "きた");
	const submit = submitters.get("?/createPost") as SubmitFunction;
	const finish = submit({
		cancel: () => {},
		formData,
	} as unknown as Parameters<SubmitFunction>[0]) as unknown as Finish;
	return { formData, respond: (result: unknown) => finish({ result, update }) };
};

const startUndo = () => {
	const submit = submitters.get("?/undoProgress") as SubmitFunction;
	const finish = submit({} as Parameters<SubmitFunction>[0]) as unknown as Finish;
	return (result: unknown) => finish({ result, update });
};

const advanced = { type: "success", data: { success: true, progressAdvance: { from: 2, to: 5, total: 12 } } };
const posted = { type: "success", data: { success: true } };

let target: HTMLElement;
let component: ReturnType<typeof mount>;
const undoButton = () => target.querySelector<HTMLButtonElement>(".progress-advance-undo");

beforeEach(async () => {
	submitters.clear();
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(JSON.stringify({ posts: [] }))),
	);
	target = document.body.appendChild(document.createElement("div"));
	component = mount(LiveRoomView, { target, props: { data, form: null } });
	await tick();
});

afterEach(async () => {
	await unmount(component);
	target.remove();
	vi.unstubAllGlobals();
});

it("話数が進んだら案内を出す", async () => {
	await startPost().respond(advanced);
	await tick();
	const text = target.querySelector(".progress-advance-text")?.textContent?.replace(/\s+/g, " ");
	expect(text).toContain("マイリストを 5 / 12 話に進めました");
});

it("投稿の送信中は元に戻せない", async () => {
	await startPost().respond(advanced);
	await tick();
	expect(undoButton()?.disabled).toBe(false);

	const second = startPost();
	await tick();
	expect(undoButton()?.disabled).toBe(true);

	await second.respond(posted);
	await tick();
	expect(undoButton()?.disabled).toBe(false);
});

it("元に戻すのを押した時点で keep_progress を送り、成功後は案内を消す", async () => {
	await startPost().respond(advanced);
	await tick();

	const respondUndo = startUndo();
	const during = startPost();
	expect(during.formData.get("keep_progress")).toBe("1");
	await during.respond(posted);

	await respondUndo({ type: "success", data: { success: true } });
	await tick();
	expect(target.querySelector(".progress-advance")).toBeNull();
	const after = startPost();
	expect(after.formData.get("keep_progress")).toBe("1");
	await after.respond(posted);
});

it("元に戻せなかったら、案内を残して次の投稿では進められるようにする", async () => {
	await startPost().respond(advanced);
	await tick();

	await startUndo()({ type: "failure", status: 500, data: { message: "失敗" } });
	await tick();
	expect(target.querySelector(".progress-advance")).not.toBeNull();
	expect(target.querySelector(".form-error")?.textContent).toContain("元に戻せませんでした");
	const next = startPost();
	expect(next.formData.has("keep_progress")).toBe(false);
	await next.respond(posted);
});
