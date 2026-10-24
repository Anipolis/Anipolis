// ステージングに動作確認用のアカウントと投稿などを作る。
//   pnpm staging:seed            … まだ無ければ作る（あれば何もしない）
//   pnpm staging:seed -- --reset … 作ったものを消してから作り直す
//
// アカウントのパスワードは .env.staging の STAGING_SEED_PASSWORD（全員共通）。
// 作品データ（anime など）は本番から写したものを使い、ここでは作らない。

import { createClient } from "@supabase/supabase-js";
import { loadStagingEnv } from "./env.ts";

const env = loadStagingEnv();
if (!env.secretKey) throw new Error(".env.staging に SUPABASE_SECRET_KEY がありません");
if (env.seedPassword.length < 8) throw new Error(".env.staging に STAGING_SEED_PASSWORD（8文字以上）がありません");

const admin = createClient(env.url, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

type SeedUser = {
	key: "admin" | "alice" | "bob" | "carol";
	username: string;
	displayName: string;
	profile: { is_admin?: boolean; is_private?: boolean; list_is_public?: boolean; bio?: string };
};

const USERS: SeedUser[] = [
	{
		key: "admin",
		username: "stg_admin",
		displayName: "管理者",
		profile: { is_admin: true, bio: "ステージングの管理者" },
	},
	{
		key: "alice",
		username: "stg_alice",
		displayName: "ありす",
		profile: { bio: "マイリスト公開・ふつうのアカウント" },
	},
	{ key: "bob", username: "stg_bob", displayName: "ぼぶ", profile: { is_private: true, bio: "鍵アカウント" } },
	{
		key: "carol",
		username: "stg_carol",
		displayName: "きゃろる",
		profile: { list_is_public: false, bio: "マイリスト非公開" },
	},
];
const emailOf = (user: SeedUser) => `${user.username}@anipolis.example`;
const INVITE_CODE = "STAGING001";

async function findUserIdByEmail(email: string): Promise<string | null> {
	for (let page = 1; ; page++) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
		if (error) throw error;
		const found = data.users.find((user) => user.email === email);
		if (found) return found.id;
		if (data.users.length < 200) return null;
	}
}

async function reset() {
	for (const user of USERS) {
		const id = await findUserIdByEmail(emailOf(user));
		if (!id) continue;
		// プロフィール以下（投稿・フォロー・マイリストなど）は外部キーの CASCADE で消える
		const { error } = await admin.auth.admin.deleteUser(id);
		if (error) throw new Error(`${user.username} の削除: ${error.message}`);
		await must(
			`${user.username} の保留ユーザー名の削除`,
			admin.from("released_usernames").delete().eq("username", user.username),
		);
		console.log(`消しました: ${user.username}`);
	}
	// 消し損ねると、作り直したときに招待コードの作成が重複で失敗するので、失敗はそのまま止める
	await must("招待コードの削除", admin.from("invites").delete().eq("code", INVITE_CODE));
}

async function must<T>(
	label: string,
	promise: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
	const { data, error } = await promise;
	if (error) throw new Error(`${label}: ${error.message}`);
	return data;
}

async function seed() {
	const ids = {} as Record<SeedUser["key"], string>;
	for (const user of USERS) {
		const { data, error } = await admin.auth.admin.createUser({
			email: emailOf(user),
			password: env.seedPassword,
			email_confirm: true,
			user_metadata: { user_name: user.username, full_name: user.displayName },
			app_metadata: { beta_member: true },
		});
		if (error) throw new Error(`${user.username} の作成: ${error.message}`);
		ids[user.key] = data.user.id;
		// アカウントを作ってもプロフィールは自動ではできない（176）ので、ここで作る
		await must(
			`${user.username} のプロフィール`,
			admin.from("profiles").insert({
				id: data.user.id,
				username: user.username,
				display_name: user.displayName,
				...user.profile,
			}),
		);
	}

	// 放送が始まっている直近の話数ルーム（実況の投稿先）と、その作品たち
	const rooms = await must(
		"話数ルーム",
		admin
			.from("episode_rooms")
			.select("id, anime_id, episode_number")
			.eq("kind", "episode")
			.is("merged_into", null)
			.lt("opens_at", new Date().toISOString())
			.order("opens_at", { ascending: false })
			.limit(6),
	);
	if (rooms.length === 0) throw new Error("放送済みの話数ルームがありません（作品データを先に写してください）");
	const animeIds = [...new Set(rooms.map((room) => room.anime_id))];
	const room = rooms[0];

	// マイリスト（ありす: 公開、ぼぶ: 鍵アカウント、きゃろる: 非公開）
	// まとめて入れると、行に無い列は既定値ではなく null になるので、全行で同じ列をそろえる
	const list = [
		{ user_id: ids.alice, anime_id: animeIds[0], status: "watching", score: 9, progress: room.episode_number ?? 1 },
		{ user_id: ids.alice, anime_id: animeIds[1] ?? animeIds[0], status: "plan_to_watch", score: null, progress: 0 },
		{ user_id: ids.bob, anime_id: animeIds[0], status: "watching", score: 7, progress: 1 },
		{ user_id: ids.carol, anime_id: animeIds[0], status: "completed", score: 10, progress: 0 },
	].filter(
		(row, index, rows) => rows.findIndex((r) => r.user_id === row.user_id && r.anime_id === row.anime_id) === index,
	);
	await must("マイリスト", admin.from("user_anime_list").insert(list));

	// フォロー（ぼぶは鍵アカウント。きゃろるは承認済み、ありすは申請中）
	await must(
		"フォロー",
		admin.from("follows").insert([
			{ follower_id: ids.alice, following_id: ids.carol },
			{ follower_id: ids.carol, following_id: ids.alice },
			{ follower_id: ids.carol, following_id: ids.bob },
			{ follower_id: ids.bob, following_id: ids.alice },
		]),
	);
	await must("フォロー申請", admin.from("follow_requests").insert({ requester_id: ids.alice, target_id: ids.bob }));

	// 投稿（ふつうの投稿・返信・引用・鍵アカウントの投稿・実況）
	const [first] = await must(
		"投稿",
		admin
			.from("posts")
			.insert({ user_id: ids.alice, content: "ステージングの最初の投稿です。今期も楽しみ！" })
			.select("id"),
	);
	await must(
		"投稿",
		admin.from("posts").insert([
			{ user_id: ids.carol, content: "返信のテストです", parent_id: first.id },
			{ user_id: ids.carol, content: "引用のテストです", quoted_post_id: first.id },
			{ user_id: ids.bob, content: "鍵アカウントの投稿です（フォロワーだけに見える）" },
			{ user_id: ids.admin, content: "管理者の投稿です" },
		]),
	);
	await must(
		"実況の投稿",
		admin.from("posts").insert([
			{ user_id: ids.alice, content: "実況のテスト投稿です", anime_id: room.anime_id, episode_room_id: room.id },
			{ user_id: ids.carol, content: "実況のテスト投稿その2", anime_id: room.anime_id, episode_room_id: room.id },
		]),
	);
	await must(
		"いいね",
		admin.from("likes").insert([
			{ user_id: ids.carol, post_id: first.id },
			{ user_id: ids.bob, post_id: first.id },
		]),
	);
	await must("リポスト", admin.from("reposts").insert({ user_id: ids.carol, post_id: first.id }));

	// 新規登録を試すための招待コード
	await must(
		"招待コード",
		admin.from("invites").insert({ code: INVITE_CODE, created_by: ids.admin, max_uses: 1000 }),
	);

	console.log("作りました:");
	for (const user of USERS) console.log(`  ${user.displayName.padEnd(6)} ${emailOf(user)}`);
	console.log(`  パスワードは .env.staging の STAGING_SEED_PASSWORD`);
	console.log(`  招待コード: ${INVITE_CODE}`);
	console.log(`  実況のあるルーム: /rooms/anime/${room.anime_id}/ep/${room.episode_number}`);
}

/** 招待コードは最後に作るので、全員そろっていて招待コードもあれば最後まで作り終えている */
async function isComplete(): Promise<boolean> {
	for (const user of USERS) if (!(await findUserIdByEmail(emailOf(user)))) return false;
	const { data } = await admin.from("invites").select("code").eq("code", INVITE_CODE).maybeSingle();
	return data != null;
}

if (process.argv.includes("--reset")) {
	await reset();
	await seed();
} else if (await isComplete()) {
	console.log("作成済みです。作り直すときは pnpm staging:seed -- --reset");
} else {
	// 前回が途中で失敗していたら、残った分を消してから作り直す
	await reset();
	await seed();
}
