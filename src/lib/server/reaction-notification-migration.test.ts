import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/132_like_repost_notification_dedupe.sql", import.meta.url),
	"utf8",
);

function functionBody(name: string) {
	const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}()`);
	expect(start).toBeGreaterThanOrEqual(0);
	const end = migration.indexOf("$$ LANGUAGE plpgsql", start);
	return migration.slice(start, end);
}

describe("like / repost notification dedupe migration (#286)", () => {
	it("removes notifications for reactions that were already undone before adding the index", () => {
		const cleanup = migration.indexOf("DELETE FROM public.notifications n");
		const index = migration.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_reaction_dedupe_idx");
		expect(cleanup).toBeGreaterThan(-1);
		expect(cleanup).toBeLessThan(index);
		expect(migration).toMatch(/n\.type = 'like'[\s\S]*FROM public\.likes l[\s\S]*l\.user_id = n\.actor_id/);
		expect(migration).toMatch(/n\.type = 'repost'[\s\S]*FROM public\.reposts r[\s\S]*r\.user_id = n\.actor_id/);
	});

	it("blocks reaction writes before cleanup, in the same lock order as the insert path", () => {
		const likes = migration.indexOf("LOCK TABLE public.likes IN SHARE ROW EXCLUSIVE MODE;");
		const reposts = migration.indexOf("LOCK TABLE public.reposts IN SHARE ROW EXCLUSIVE MODE;");
		const notifications = migration.indexOf("LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;");
		const cleanup = migration.indexOf("DELETE FROM public.notifications n");
		expect(likes).toBeGreaterThan(-1);
		expect(likes).toBeLessThan(reposts);
		expect(reposts).toBeLessThan(notifications);
		expect(notifications).toBeLessThan(cleanup);
	});

	it("keeps the oldest unread duplicate and locks the table while cleaning", () => {
		expect(migration).toContain("LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;");
		expect(migration).toMatch(/duplicate\.type IN \('like', 'repost'\)[\s\S]*NOT duplicate\.read/);
		expect(migration).toContain("(duplicate.created_at, duplicate.id) > (keeper.created_at, keeper.id)");
	});

	it("enforces at most one unread like or repost notification per actor and post", () => {
		expect(migration).toMatch(
			/CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_reaction_dedupe_idx\s+ON public\.notifications \(recipient_id, actor_id, post_id, type\)\s+WHERE type IN \('like', 'repost'\) AND NOT read;/,
		);
	});

	it.each([
		"notify_on_like",
		"notify_on_repost",
	])("%s inserts with ON CONFLICT DO NOTHING against that index", (name) => {
		const body = functionBody(name);
		expect(body).toContain("post_author_id != NEW.user_id");
		expect(body).toMatch(
			/ON CONFLICT \(recipient_id, actor_id, post_id, type\)\s+WHERE type IN \('like', 'repost'\) AND NOT read\s+DO NOTHING/,
		);
		expect(migration).toContain(`${name}()\nRETURNS TRIGGER AS $$`);
	});

	it.each([
		{ fn: "handle_unlike_delete_notification", table: "likes", trigger: "on_like_deleted", type: "like" },
		{ fn: "handle_unrepost_delete_notification", table: "reposts", trigger: "on_repost_deleted", type: "repost" },
	])("deletes the $type notification when the reaction row is removed", ({ fn, table, trigger, type }) => {
		const body = functionBody(fn);
		expect(body).toContain(`type = '${type}'`);
		expect(body).toContain("actor_id = OLD.user_id");
		expect(body).toContain("post_id = OLD.post_id");
		expect(body).not.toContain("NOT read");
		expect(migration).toMatch(
			new RegExp(
				`CREATE TRIGGER ${trigger}\\s+AFTER DELETE ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.${fn}\\(\\);`,
			),
		);
	});

	it("pins search_path on every SECURITY DEFINER function it defines", () => {
		const definers = migration.match(/SECURITY DEFINER SET search_path = public;/g) ?? [];
		expect(definers).toHaveLength(4);
		expect(migration).not.toMatch(/SECURITY DEFINER;/);
	});
});
