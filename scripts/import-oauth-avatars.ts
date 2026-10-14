import { createClient } from "@supabase/supabase-js";
import { fetchOAuthAvatar, parseOAuthAvatarUrl } from "../src/lib/server/oauth-avatar.ts";

// profiles.avatar_url に OAuth プロバイダーの外部 URL（Discord・Google・X）がそのまま入っている
// アカウントの画像を、profile-avatars に取り込んで差し替える（#328）。
// 新規のプロフィール作成はアプリ側で取り込むので、これは既存分の移行用。
//
//   pnpm import:oauth-avatars            # 確認だけ（書き換えない）
//   pnpm import:oauth-avatars -- --apply # 取り込んで avatar_url を書き換える
//
// 取得できなかった画像（リンク切れ等）は書き換えずに残す。画面側は読み込みに失敗すると
// 頭文字の表示に切り替わる。

const apply = process.argv.includes("--apply");

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
		);
	}
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const supabase = getSupabaseClient();
// PostgREST の上限（本番 1000 件）で切れないよう、id の順にページを追って全件を見る
const PAGE_SIZE = 1000;
const profiles: { id: string; username: string; avatar_url: string }[] = [];
for (let from = 0; ; from += PAGE_SIZE) {
	const { data, error } = await supabase
		.from("profiles")
		.select("id, username, avatar_url")
		.not("avatar_url", "is", null)
		.order("id")
		.range(from, from + PAGE_SIZE - 1);
	if (error) throw new Error(error.message);
	profiles.push(...((data ?? []) as typeof profiles));
	if ((data ?? []).length < PAGE_SIZE) break;
}

const targets = profiles.filter((profile) => parseOAuthAvatarUrl(profile.avatar_url));
console.log(`${apply ? "APPLY" : "DRY RUN"}: ${targets.length} profiles with an external OAuth avatar`);

let imported = 0;
let failed = 0;
for (const profile of targets) {
	const host = new URL(profile.avatar_url).hostname;
	const avatar = await fetchOAuthAvatar(profile.avatar_url);
	if (!avatar) {
		failed++;
		console.log(`  skip  @${profile.username} (${host}): could not fetch a valid image`);
		continue;
	}
	if (!apply) {
		console.log(`  ok    @${profile.username} (${host}): ${avatar.mime}, ${avatar.bytes.byteLength} bytes`);
		imported++;
		continue;
	}

	const path = `${profile.id}/avatar_${Date.now()}.${avatar.ext}`;
	const { error: uploadError } = await supabase.storage
		.from("profile-avatars")
		.upload(path, avatar.bytes, { contentType: avatar.mime });
	if (uploadError) {
		failed++;
		console.error(`  error @${profile.username}: upload failed: ${uploadError.message}`);
		continue;
	}
	const {
		data: { publicUrl },
	} = supabase.storage.from("profile-avatars").getPublicUrl(path);

	// 実行中に本人が画像を変えていたら上書きしない
	const { data: updated, error: updateError } = await supabase
		.from("profiles")
		.update({ avatar_url: publicUrl })
		.eq("id", profile.id)
		.eq("avatar_url", profile.avatar_url)
		.select("id");
	if (updateError || !updated?.length) {
		failed++;
		await supabase.storage.from("profile-avatars").remove([path]);
		console.error(`  error @${profile.username}: profile not updated: ${updateError?.message ?? "avatar changed"}`);
		continue;
	}
	imported++;
	console.log(`  done  @${profile.username} (${host})`);
}

console.log(`${apply ? "imported" : "importable"}: ${imported}, skipped/failed: ${failed}`);
