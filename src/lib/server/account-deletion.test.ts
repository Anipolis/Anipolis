import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import {
	checkDeletionGate,
	DELETE_REAUTH_WINDOW_MS,
	deleteAccount,
	STORAGE_LIST_PAGE_SIZE,
	USER_OWNED_BUCKETS,
} from "./account-deletion";

const migration = readFileSync(
	new URL("../../../supabase/migrations/142_account_deletion.sql", import.meta.url),
	"utf8",
);

type AuthUser = Parameters<typeof checkDeletionGate>[0]["user"];
type AuthSession = Parameters<typeof checkDeletionGate>[0]["session"];

/** amr のタイムスタンプ（秒）を持つアクセストークンを組み立てる */
function sessionSignedInAt(msAgo: number | null, method = "oauth"): AuthSession {
	if (msAgo === null) return { access_token: "no.payload" } as unknown as AuthSession;
	const payload = {
		amr: [{ method, timestamp: Math.floor((Date.now() - msAgo) / 1000) }],
		app_metadata: { provider: method === "password" ? "email" : "discord" },
	};
	const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
	return { access_token: `header.${encoded}.signature` } as unknown as AuthSession;
}

const oauthUser = {
	email: "user@example.com",
	app_metadata: { provider: "discord", providers: ["discord"] },
	user_metadata: {},
	identities: [{ provider: "discord" }],
} as unknown as AuthUser;

const passwordUser = {
	email: "user@example.com",
	app_metadata: { provider: "email", providers: ["email"] },
	user_metadata: {},
	identities: [{ provider: "email" }],
} as unknown as AuthUser;

describe("checkDeletionGate", () => {
	it("ユーザー名が一致しなければ退会させない", () => {
		const gate = checkDeletionGate({
			user: passwordUser,
			session: sessionSignedInAt(0, "password"),
			username: "animetaro",
			confirmation: "animejiro",
		});
		expect(gate).toEqual({ ok: false, reason: "username_mismatch" });
	});

	it("大文字・前後の空白は一致として扱う", () => {
		const gate = checkDeletionGate({
			user: passwordUser,
			session: sessionSignedInAt(0, "password"),
			username: "animetaro",
			confirmation: "  AnimeTaro ",
		});
		expect(gate).toEqual({ ok: true, needsPassword: true });
	});

	it("パスワードを持つアカウントはパスワード確認を要求する", () => {
		const gate = checkDeletionGate({
			user: passwordUser,
			// 1時間前のログインでも、パスワードを確認するなら退会できる
			session: sessionSignedInAt(60 * 60_000, "password"),
			username: "animetaro",
			confirmation: "animetaro",
		});
		expect(gate).toEqual({ ok: true, needsPassword: true });
	});

	it("OAuth のみのアカウントは直近のログインを要求する", () => {
		const recent = checkDeletionGate({
			user: oauthUser,
			session: sessionSignedInAt(DELETE_REAUTH_WINDOW_MS - 60_000),
			username: "animetaro",
			confirmation: "animetaro",
		});
		expect(recent).toEqual({ ok: true, needsPassword: false });

		const stale = checkDeletionGate({
			user: oauthUser,
			session: sessionSignedInAt(DELETE_REAUTH_WINDOW_MS + 60_000),
			username: "animetaro",
			confirmation: "animetaro",
		});
		expect(stale).toEqual({ ok: false, reason: "reauth_required" });
	});

	it("ログイン時刻が読めないセッションは退会させない", () => {
		const gate = checkDeletionGate({
			user: oauthUser,
			session: sessionSignedInAt(null),
			username: "animetaro",
			confirmation: "animetaro",
		});
		expect(gate).toEqual({ ok: false, reason: "reauth_required" });
	});
});

type StorageMock = {
	list: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
};

type CleanupRow = {
	user_id: string;
	requested_at: string;
	attempts: number;
	last_attempt_at?: string | null;
	last_error?: string | null;
};

function createAdminMock(
	options: {
		/** owner を省略したファイルは user-1 のもの */
		filesByBucket?: Record<string, { name: string; owner?: string }[]>;
		deleteUserError?: { message: string } | null;
		listError?: { message: string } | null;
		removeError?: { message: string } | null;
		/** true なら remove が成功を返しても実際には何も消さない（サブフォルダ等） */
		removeIsNoop?: boolean;
		postCount?: number;
		moderationStatus?: string | null;
		/** account_storage_cleanups に最初からある行（前の退会の消し残し） */
		pendingCleanups?: CleanupRow[];
		recordError?: { message: string } | null;
		/** auth にまだ存在する利用者 */
		existingUserIds?: string[];
		/** getUserById が 404 以外のエラーを返す（存否を確かめられない） */
		lookupError?: boolean;
	} = {},
) {
	const storageByBucket = new Map<string, StorageMock>();
	const removed: { bucket: string; paths: string[] }[] = [];
	const inserted: unknown[] = [];
	const cleanups = new Map<string, CleanupRow>((options.pendingCleanups ?? []).map((row) => [row.user_id, row]));
	const existing = new Set(options.existingUserIds ?? []);
	const deleteUser = vi.fn(async () => ({ error: options.deleteUserError ?? null }));
	const getUserById = vi.fn(async (id: string) => {
		if (options.lookupError) return { data: { user: null }, error: { status: 500, message: "upstream timeout" } };
		return existing.has(id)
			? { data: { user: { id } }, error: null }
			: { data: { user: null }, error: { status: 404, message: "User not found" } };
	});

	/** account_storage_cleanups の select / update / delete の条件を最小限まねる */
	const cleanupQuery = (op: "select" | "update" | "delete", patch?: Partial<CleanupRow>) => {
		const filters: ((row: CleanupRow) => boolean)[] = [];
		let limit = Number.POSITIVE_INFINITY;
		const rows = () =>
			[...cleanups.values()]
				.filter((row) => filters.every((f) => f(row)))
				.sort(
					(a, b) =>
						(a.last_attempt_at ?? "").localeCompare(b.last_attempt_at ?? "") ||
						a.requested_at.localeCompare(b.requested_at),
				)
				.slice(0, limit);
		const run = () => {
			const matched = rows();
			if (op === "delete") for (const row of matched) cleanups.delete(row.user_id);
			if (op === "update") for (const row of matched) Object.assign(row, patch);
			return { data: op === "select" ? matched : null, error: null };
		};
		// await できるように、Promise に条件のメソッドを足す（条件は await までに積まれ、実行は次のマイクロタスク）
		const query = Object.assign(Promise.resolve().then(run), {
			eq: (column: keyof CleanupRow, value: unknown) => {
				filters.push((row) => row[column] === value);
				return query;
			},
			neq: (column: keyof CleanupRow, value: unknown) => {
				filters.push((row) => row[column] !== value);
				return query;
			},
			lt: (column: keyof CleanupRow, value: string) => {
				filters.push((row) => String(row[column]) < value);
				return query;
			},
			order: () => query,
			limit: (n: number) => {
				limit = n;
				return query;
			},
			maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
		});
		return query;
	};

	const client = {
		from: vi.fn((table: string) => {
			if (table === "account_moderation") {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							maybeSingle: vi.fn(async () => ({
								data: options.moderationStatus ? { status: options.moderationStatus } : null,
								error: null,
							})),
						})),
					})),
				};
			}
			if (table === "posts") {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(async () => ({ count: options.postCount ?? 0, error: null })),
					})),
				};
			}
			if (table === "account_deletions") {
				return {
					insert: vi.fn(async (payload: unknown) => {
						inserted.push(payload);
						return { error: null };
					}),
				};
			}
			if (table === "account_storage_cleanups") {
				return {
					upsert: vi.fn(async (row: { user_id: string }) => {
						if (options.recordError) return { error: options.recordError };
						if (!cleanups.has(row.user_id)) {
							cleanups.set(row.user_id, {
								user_id: row.user_id,
								requested_at: new Date().toISOString(),
								attempts: 0,
							});
						}
						return { error: null };
					}),
					select: vi.fn(() => cleanupQuery("select")),
					update: vi.fn((patch: Partial<CleanupRow>) => cleanupQuery("update", patch)),
					delete: vi.fn(() => cleanupQuery("delete")),
				};
			}
			throw new Error(`unexpected table: ${table}`);
		}),
		storage: {
			from: vi.fn((bucket: string) => {
				let mock = storageByBucket.get(bucket);
				if (!mock) {
					// 実際の Storage と同じく、削除したファイルは次の列挙から消え、list は直下の項目だけ
					// （フォルダは id が null）を limit / offset で返す。name に "/" を含むものはサブフォルダの中身
					const remaining = [...(options.filesByBucket?.[bucket] ?? [])].map(
						(file) => `${file.owner ?? "user-1"}/${file.name}`,
					);
					mock = {
						list: vi.fn(async (prefix: string, listOptions?: { limit?: number; offset?: number }) => {
							if (options.listError) return { data: null, error: options.listError };
							const children = new Map<string, { name: string; id: string | null }>();
							for (const path of remaining) {
								if (!path.startsWith(`${prefix}/`)) continue;
								const rest = path.slice(prefix.length + 1);
								const [head, ...tail] = rest.split("/");
								if (!head) continue;
								children.set(head, { name: head, id: tail.length > 0 ? null : `id-${path}` });
							}
							const sorted = [...children.values()].sort((a, b) => a.name.localeCompare(b.name));
							const offset = listOptions?.offset ?? 0;
							return { data: sorted.slice(offset, offset + (listOptions?.limit ?? 100)), error: null };
						}),
						remove: vi.fn(async (paths: string[]) => {
							if (options.removeError) return { data: null, error: options.removeError };
							if (options.removeIsNoop) return { data: [], error: null };
							removed.push({ bucket, paths });
							const keys = new Set(paths);
							const deleted = remaining.filter((path) => keys.has(path));
							remaining.splice(0, remaining.length, ...remaining.filter((path) => !keys.has(path)));
							return { data: deleted.map((name) => ({ name })), error: null };
						}),
					};
					storageByBucket.set(bucket, mock);
				}
				return mock;
			}),
		},
		auth: { admin: { deleteUser, getUserById } },
	};

	return { client: client as unknown as SupabaseClient<Database>, removed, inserted, deleteUser, cleanups };
}

describe("deleteAccount", () => {
	it("auth ユーザーを消す前に本人のストレージを消す（消し漏れを残さない）", async () => {
		const admin = createAdminMock({
			filesByBucket: {
				"post-images": [{ name: "a.webp" }, { name: "b.webp" }],
				"profile-avatars": [{ name: "avatar_1.webp" }],
				"profile-headers": [],
			},
			postCount: 7,
			moderationStatus: "restricted",
		});

		const result = await deleteAccount("user-1", { admin: admin.client });

		expect(result).toEqual({ ok: true, removedFiles: 3 });
		expect(admin.removed).toEqual([
			{ bucket: "post-images", paths: ["user-1/a.webp", "user-1/b.webp"] },
			{ bucket: "profile-avatars", paths: ["user-1/avatar_1.webp"] },
		]);
		expect(admin.deleteUser).toHaveBeenCalledWith("user-1");
		// 個人を識別する値は監査行に入れない
		expect(admin.inserted).toEqual([{ moderation_status: "restricted", post_count: 7, initiated_by: "self" }]);
	});

	it("対象の3バケットすべてを見る", async () => {
		const admin = createAdminMock();
		await deleteAccount("user-1", { admin: admin.client });
		for (const bucket of USER_OWNED_BUCKETS) {
			expect(admin.client.storage.from).toHaveBeenCalledWith(bucket);
		}
	});

	it("auth ユーザーを先に消し、その後でファイルを消す", async () => {
		const admin = createAdminMock({ filesByBucket: { "post-images": [{ name: "a.webp" }] } });
		await deleteAccount("user-1", { admin: admin.client });
		const deletedAt = admin.deleteUser.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
		const firstStorageCall = vi.mocked(admin.client.storage.from).mock.invocationCallOrder[0] ?? 0;
		expect(deletedAt).toBeLessThan(firstStorageCall);
	});

	it("1ページに収まらない枚数でも全件消す", async () => {
		const total = STORAGE_LIST_PAGE_SIZE * 2 + 1;
		const files = Array.from({ length: total }, (_, index) => ({ name: `${index}.webp` }));
		const admin = createAdminMock({ filesByBucket: { "post-images": files } });

		const result = await deleteAccount("user-1", { admin: admin.client });

		expect(result).toEqual({ ok: true, removedFiles: total });
		expect(admin.removed.flatMap((entry) => entry.paths)).toHaveLength(total);
		expect(admin.deleteUser).toHaveBeenCalledWith("user-1");
	});

	it("auth ユーザーの削除に失敗したらファイルには触れない（画像だけが失われないように）", async () => {
		const admin = createAdminMock({
			filesByBucket: { "post-images": [{ name: "a.webp" }] },
			deleteUserError: { message: "service unavailable" },
			existingUserIds: ["user-1"],
		});
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: false, reason: "failed" });
		expect(admin.removed).toEqual([]);
		expect(admin.inserted).toEqual([]);
	});

	it("全部消せたら、消す予定の記録を外す", async () => {
		const admin = createAdminMock({ filesByBucket: { "post-images": [{ name: "a.webp" }] } });
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: true, removedFiles: 1 });
		expect(admin.cleanups.size).toBe(0);
	});

	it("ファイルの削除に失敗したら、アカウントは削除済みなので成功を返し、記録を残して後でやり直す", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		for (const failure of [{ listError: { message: "storage unavailable" } }, { removeError: { message: "x" } }]) {
			const admin = createAdminMock({ filesByBucket: { "post-images": [{ name: "a.webp" }] }, ...failure });
			const result = await deleteAccount("user-1", { admin: admin.client });
			expect(result.ok).toBe(true);
			expect(admin.deleteUser).toHaveBeenCalledWith("user-1");
			expect(admin.inserted).toHaveLength(1);
			expect(admin.cleanups.get("user-1")?.attempts).toBe(1);
		}
	});

	it("消す予定を記録できなければ退会を始めない", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const admin = createAdminMock({ recordError: { message: "db unavailable" } });
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: false, reason: "failed" });
		expect(admin.deleteUser).not.toHaveBeenCalled();
	});

	it("auth ユーザーの削除に失敗し、まだ存在するなら、ファイルに触れず記録は残す（並行する退会の手がかりを消さない）", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const admin = createAdminMock({
			filesByBucket: { "post-images": [{ name: "a.webp" }] },
			deleteUserError: { message: "service unavailable" },
			existingUserIds: ["user-1"],
		});
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: false, reason: "failed" });
		expect(admin.removed).toEqual([]);
		expect(admin.cleanups.has("user-1")).toBe(true);
	});

	it("前の退会で消し残したファイルをやり直す。auth にまだいる利用者と、退会の途中の記録には触れない", async () => {
		const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
		const justNow = new Date().toISOString();
		const admin = createAdminMock({
			filesByBucket: {
				"post-images": [
					{ name: "gone.webp", owner: "gone-user" },
					{ name: "alive.webp", owner: "alive-user" },
					{ name: "inflight.webp", owner: "inflight-user" },
				],
			},
			pendingCleanups: [
				{ user_id: "gone-user", requested_at: hourAgo, attempts: 1 },
				{ user_id: "alive-user", requested_at: hourAgo, attempts: 0 },
				{ user_id: "inflight-user", requested_at: justNow, attempts: 0 },
			],
			existingUserIds: ["alive-user"],
		});
		await deleteAccount("user-1", { admin: admin.client });
		const removedPaths = admin.removed.flatMap((entry) => entry.paths);
		expect(removedPaths).toContain("gone-user/gone.webp");
		expect(removedPaths).not.toContain("alive-user/alive.webp");
		expect(removedPaths).not.toContain("inflight-user/inflight.webp");
		expect([...admin.cleanups.keys()].sort()).toEqual(["alive-user", "inflight-user"]);
	});

	it("サブフォルダの中のファイルも消す", async () => {
		const admin = createAdminMock({
			filesByBucket: { "post-images": [{ name: "a.webp" }, { name: "sub/b.webp" }, { name: "sub/deep/c.webp" }] },
		});
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: true, removedFiles: 3 });
		expect(admin.removed.flatMap((entry) => entry.paths).sort()).toEqual([
			"user-1/a.webp",
			"user-1/sub/b.webp",
			"user-1/sub/deep/c.webp",
		]);
		expect(admin.cleanups.size).toBe(0);
	});

	it("消したはずのファイルが残っていれば、記録を残して後でやり直す", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const admin = createAdminMock({ filesByBucket: { "post-images": [{ name: "a.webp" }] }, removeIsNoop: true });
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result.ok).toBe(true);
		expect(admin.cleanups.get("user-1")?.attempts).toBe(1);
	});

	it("auth の削除がエラーでも、確かめて消えていれば退会は完了として続ける（応答だけの失敗）", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const admin = createAdminMock({
			filesByBucket: { "post-images": [{ name: "a.webp" }] },
			deleteUserError: { message: "socket hang up" },
		});
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: true, removedFiles: 1 });
		expect(admin.inserted).toHaveLength(1);
		expect(admin.cleanups.size).toBe(0);
	});

	it("auth の削除がエラーで、存否も確かめられなければ記録を残して失敗を返す", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const admin = createAdminMock({
			filesByBucket: { "post-images": [{ name: "a.webp" }] },
			deleteUserError: { message: "socket hang up" },
			lookupError: true,
		});
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: false, reason: "failed" });
		expect(admin.removed).toEqual([]);
		expect(admin.cleanups.has("user-1")).toBe(true);
	});

	it("失敗し続ける記録は後ろに回し、後ろの記録にも届く", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const old = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
		const admin = createAdminMock({
			filesByBucket: { "post-images": [{ name: "x.webp", owner: "fresh-user" }] },
			pendingCleanups: [
				// 最も古いが、直前に試して失敗した記録（auth にまだいる）
				{ user_id: "stuck-1", requested_at: old(300), attempts: 5, last_attempt_at: old(1) },
				{ user_id: "stuck-2", requested_at: old(299), attempts: 5, last_attempt_at: old(1) },
				{ user_id: "stuck-3", requested_at: old(298), attempts: 5, last_attempt_at: old(1) },
				// 新しいが、まだ一度も試していない記録
				{ user_id: "fresh-user", requested_at: old(60), attempts: 0 },
			],
			existingUserIds: ["stuck-1", "stuck-2", "stuck-3"],
		});
		await deleteAccount("user-1", { admin: admin.client });
		expect(admin.removed.flatMap((entry) => entry.paths)).toContain("fresh-user/x.webp");
		expect(admin.cleanups.has("fresh-user")).toBe(false);
	});

	it("外部キーで削除が止まった場合は原因が分かる理由を返す", async () => {
		const admin = createAdminMock({
			deleteUserError: { message: 'update or delete on table "users" violates foreign key constraint' },
			existingUserIds: ["user-1"],
		});
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: false, reason: "has_room_experiments" });
		// 削除できていないので監査行も残さない
		expect(admin.inserted).toEqual([]);
	});

	it("その他の失敗は failed として返す", async () => {
		const admin = createAdminMock({
			deleteUserError: { message: "service unavailable" },
			existingUserIds: ["user-1"],
		});
		const result = await deleteAccount("user-1", { admin: admin.client });
		expect(result).toEqual({ ok: false, reason: "failed" });
	});
});

describe("account deletion migration", () => {
	it("連鎖削除を止めていた room_experiment_runs.created_by を SET NULL にする", () => {
		expect(migration).toContain("ALTER COLUMN created_by DROP NOT NULL");
		expect(migration).toMatch(
			/ADD CONSTRAINT room_experiment_runs_created_by_fkey[\s\S]*?REFERENCES public\.profiles\(id\) ON DELETE SET NULL/,
		);
	});

	it("退会の記録は個人を識別しない列だけを持つ", () => {
		expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.account_deletions");
		expect(migration).toContain("ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY");
		expect(migration).toMatch(/moderation_status text NOT NULL[\s\S]*?CHECK \(moderation_status IN/);
		expect(migration).toMatch(/initiated_by text NOT NULL[\s\S]*?CHECK \(initiated_by IN \('self', 'admin'\)\)/);
		// ユーザー ID・メール・ユーザー名は保存しない
		expect(migration).not.toMatch(/account_deletions[\s\S]*?(email|username|user_id)/);
		// 読めるのは管理者だけ、書き込みポリシーは作らない（service role のみ）
		expect(migration).toMatch(/CREATE POLICY "account_deletions_select_admin"[\s\S]*?is_current_user_admin\(\)/);
		expect(migration).not.toMatch(/account_deletions FOR INSERT/);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
