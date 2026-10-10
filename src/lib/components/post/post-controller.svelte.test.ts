import type { ActionResult } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";
import type { Post } from "$lib/types";
import { PostController } from "./post-controller.svelte";

function makePost(overrides: Partial<Post> = {}): Post {
	return {
		id: "p1",
		user_id: "author",
		like_count: 5,
		liked_by_me: false,
		repost_count: 2,
		reposted_by_me: false,
		bookmarked_by_me: false,
		...overrides,
	} as Post;
}

type Submit = (
	input: never,
) => ((opts: { result: ActionResult; update: () => Promise<void> }) => Promise<void>) | undefined;

/** use:enhance が SubmitFunction を呼ぶのと同じ形で送信を始める */
function start(handler: Submit) {
	const cancel = vi.fn();
	const form = document.createElement("form");
	const callback = handler({ formElement: form, cancel } as never);
	return { cancel, callback, form };
}

async function finish(callback: ReturnType<Submit>, result: ActionResult): Promise<ReturnType<typeof vi.fn>> {
	const update = vi.fn(async () => {});
	await callback?.({ result, update });
	return update;
}

const success = (data: Record<string, unknown>): ActionResult => ({ type: "success", status: 200, data });
const failure: ActionResult = { type: "failure", status: 500, data: { message: "失敗しました" } };

describe("PostController reactions", () => {
	it("confirms a like from the action result without reloading the page", async () => {
		const controller = new PostController(
			() => makePost(),
			() => "viewer",
		);
		const { callback } = start(controller.handleLike as Submit);
		expect(controller.likedByMe).toBe(true);
		expect(controller.likeCount).toBe(6);

		const update = await finish(callback, success({ liked: true }));

		// update() は load 全体を再実行する（#100）。成功時は呼ばない
		expect(update).not.toHaveBeenCalled();
		expect(controller.likedByMe).toBe(true);
		expect(controller.likeCount).toBe(6);
	});

	// 送信中の連打は送らずに表示だけ反転し、応答後に押した結果とズレていれば 1 回だけ再送する（fdbb076）
	it("shows a like toggled while the first is in flight and resubmits once after the response", async () => {
		const controller = new PostController(
			() => makePost(),
			() => "viewer",
		);
		const first = start(controller.handleLike as Submit);
		const resubmit = vi.spyOn(first.form, "requestSubmit").mockImplementation(() => {});
		const second = start(controller.handleLike as Submit);

		expect(second.cancel).toHaveBeenCalledTimes(1);
		expect(second.callback).toBeUndefined();
		expect(controller.likedByMe).toBe(false);
		expect(controller.likeCount).toBe(5);

		await finish(first.callback, success({ liked: true }));
		expect(resubmit).toHaveBeenCalledTimes(1);

		// 再送は新しい送信として扱われる（送信中のまま取り残されない）
		const third = start(controller.handleLike as Submit);
		expect(third.cancel).not.toHaveBeenCalled();
		expect(controller.likedByMe).toBe(false);
		expect(controller.likeCount).toBe(5);
	});

	it("does not resubmit when clicks during the request cancel each other out", async () => {
		const controller = new PostController(
			() => makePost(),
			() => "viewer",
		);
		const first = start(controller.handleLike as Submit);
		const resubmit = vi.spyOn(first.form, "requestSubmit").mockImplementation(() => {});
		start(controller.handleLike as Submit);
		start(controller.handleLike as Submit);
		expect(controller.likedByMe).toBe(true);
		expect(controller.likeCount).toBe(6);

		await finish(first.callback, success({ liked: true }));
		expect(resubmit).not.toHaveBeenCalled();
		expect(controller.likedByMe).toBe(true);
		expect(controller.likeCount).toBe(6);
	});

	it("restores the last confirmed state on failure instead of the stale post prop", async () => {
		const controller = new PostController(
			() => makePost(),
			() => "viewer",
		);
		await finish(start(controller.handleLike as Submit).callback, success({ liked: true }));
		expect(controller.likeCount).toBe(6);

		// 取り消しが失敗: 成功済みのいいね（6 件・いいね済み）に戻す。props の 5 件・未いいねには戻さない
		const undo = start(controller.handleLike as Submit);
		expect(controller.likedByMe).toBe(false);
		await finish(undo.callback, failure);

		expect(controller.likedByMe).toBe(true);
		expect(controller.likeCount).toBe(6);
		expect(controller.reactionFeedback.message).not.toBe("");
	});

	it("does not reload the page after a bookmark or a repost either", async () => {
		const controller = new PostController(
			() => makePost(),
			() => "viewer",
		);

		const bookmarkUpdate = await finish(
			start(controller.handleBookmark as Submit).callback,
			success({ bookmarked: true }),
		);
		const repostUpdate = await finish(
			start(controller.handleRepost as Submit).callback,
			success({ reposted: true }),
		);

		expect(bookmarkUpdate).not.toHaveBeenCalled();
		expect(repostUpdate).not.toHaveBeenCalled();
		expect(controller.bookmarkedByMe).toBe(true);
		expect(controller.repostedByMe).toBe(true);
		expect(controller.repostCount).toBe(3);
	});
});
