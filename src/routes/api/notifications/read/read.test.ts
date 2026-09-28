import { describe, expect, it, vi } from "vitest";
import { parseNotificationCategory } from "$lib/server/notification-category";
import { POST } from "./+server";

type Call = { method: string; args: unknown[] };

function notificationsClient(result: { error: { message: string } | null } = { error: null }) {
	const calls: Call[] = [];
	// Supabase のクエリビルダーと同様に、各フィルターは await 可能なまま次のフィルターも受け付ける
	const step = (method: string) =>
		vi.fn((...args: unknown[]) => {
			calls.push({ method, args });
			return Object.assign(Promise.resolve(result), { eq: step("eq"), not: step("not") });
		});
	const chain = { update: step("update") };
	const from = vi.fn((table: string) => {
		if (table !== "notifications") throw new Error(`unexpected table: ${table}`);
		return chain;
	});
	return { client: { from }, calls };
}

function makeEvent(body: unknown, user: { id: string } | null, client: unknown) {
	const request = new Request("http://localhost/api/notifications/read", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
	return {
		request,
		locals: { supabase: client, safeGetSession: async () => ({ user, session: null }) },
	} as unknown as Parameters<typeof POST>[0];
}

describe("parseNotificationCategory", () => {
	it("accepts the three known categories only", () => {
		expect(parseNotificationCategory("normal")).toBe("normal");
		expect(parseNotificationCategory("room")).toBe("room");
		expect(parseNotificationCategory("mylist")).toBe("mylist");
		expect(parseNotificationCategory("all")).toBeNull();
		expect(parseNotificationCategory(1)).toBeNull();
		expect(parseNotificationCategory(undefined)).toBeNull();
	});
});

describe("POST /api/notifications/read", () => {
	it("rejects anonymous callers before touching the database", async () => {
		const { client, calls } = notificationsClient();
		await expect(POST(makeEvent({ category: "normal" }, null, client))).rejects.toMatchObject({ status: 401 });
		expect(calls).toHaveLength(0);
	});

	it("rejects a malformed body and an unknown category", async () => {
		const { client, calls } = notificationsClient();
		await expect(POST(makeEvent("{not json", { id: "u1" }, client))).rejects.toMatchObject({ status: 400 });
		await expect(POST(makeEvent({ category: "everything" }, { id: "u1" }, client))).rejects.toMatchObject({
			status: 400,
		});
		expect(calls).toHaveLength(0);
	});

	it("marks only the requested room category read for the caller", async () => {
		const { client, calls } = notificationsClient();
		const response = await POST(makeEvent({ category: "room" }, { id: "u1" }, client));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true, category: "room" });
		expect(calls).toEqual([
			{ method: "update", args: [{ read: true }] },
			{ method: "eq", args: ["recipient_id", "u1"] },
			{ method: "eq", args: ["read", false] },
			{ method: "eq", args: ["type", "broadcast"] },
		]);
	});

	it("excludes room and mylist types when marking the normal category", async () => {
		const { client, calls } = notificationsClient();
		await POST(makeEvent({ category: "normal" }, { id: "u1" }, client));
		expect(calls.at(-1)).toEqual({ method: "not", args: ["type", "in", "(broadcast,mylist_status)"] });
	});

	it("surfaces a database failure instead of reporting success", async () => {
		const { client } = notificationsClient({ error: { message: "boom" } });
		await expect(POST(makeEvent({ category: "mylist" }, { id: "u1" }, client))).rejects.toMatchObject({
			status: 500,
		});
	});
});
