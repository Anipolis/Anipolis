import { mount, tick, unmount } from "svelte";
import { expect, it, vi } from "vitest";
import type { LiveRoomData } from "$lib/types/live-room";
import LiveRoomView from "./LiveRoomView.svelte";

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

it("sends with Enter but preserves IME confirmation and Shift+Enter", async () => {
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
	const target = document.body.appendChild(document.createElement("div"));
	const component = mount(LiveRoomView, { target, props: { data, form: null } });
	try {
		await tick();
		const textarea = target.querySelector("textarea");
		const form = target.querySelector("form");
		if (!textarea || !form) throw new Error("Missing room composer");
		const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => {});
		textarea.value = "きた";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
		textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true }));
		textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
		expect(submit).not.toHaveBeenCalled();
		textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(submit).toHaveBeenCalledOnce();
	} finally {
		await unmount(component);
		target.remove();
		vi.restoreAllMocks();
	}
});
