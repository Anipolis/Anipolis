import { describe, expect, it } from "vitest";
import { type InviteCodeState, syncInviteCodeState } from "./invite-code";

function createState(): InviteCodeState {
	return { value: "", dirty: false, source: null, linkSource: "" };
}

describe("syncInviteCodeState", () => {
	it("updates the field when a new invite link is opened", () => {
		const state = createState();

		syncInviteCodeState(state, "FROM-LINK-1", "FROM-LINK-1");
		state.value = "MANUAL-CODE";
		state.dirty = true;

		syncInviteCodeState(state, "FROM-LINK-2", "FROM-LINK-2");

		expect(state).toEqual({
			value: "FROM-LINK-2",
			dirty: false,
			source: "FROM-LINK-2",
			linkSource: "FROM-LINK-2",
		});
	});

	it("preserves manual input for action results, cookie hydration, and mode changes", () => {
		const state = createState();

		syncInviteCodeState(state, "FROM-LINK", "FROM-LINK");
		state.value = "MANUAL-CODE";
		state.dirty = true;

		syncInviteCodeState(state, "COOKIE-CODE", "");
		syncInviteCodeState(state, "COOKIE-CODE", "");

		expect(state.value).toBe("MANUAL-CODE");
		expect(state.dirty).toBe(true);
	});
});
