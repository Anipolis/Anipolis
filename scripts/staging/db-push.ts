// ステージングに migration を流す。CLI のリンク先（本番）は使わず、--db-url で接続先を明示する。
//   pnpm staging:db-push            … 流す前に一覧だけ見る（dry-run）
//   pnpm staging:db-push -- --apply … 実際に流す

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { loadStagingEnv } from "./env.ts";

const env = loadStagingEnv();
if (!env.dbUrl) throw new Error(".env.staging に STAGING_DB_URL がありません");

const apply = process.argv.includes("--apply");
// パスワードの記号がシェルで崩れないよう、シェルを通さずに CLI を直接起動する
const cli = join(dirname(createRequire(import.meta.url).resolve("supabase/package.json")), "dist", "supabase.js");
const args = [cli, "db", "push", "--db-url", env.dbUrl, ...(apply ? ["--yes"] : ["--dry-run"])];
console.log(`ステージング（${env.ref}）に migration を${apply ? "流します" : "流す前の確認をします（dry-run）"}`);

const result = spawnSync(process.execPath, args, { stdio: ["inherit", "pipe", "pipe"], encoding: "utf8" });
// 接続文字列（パスワード入り）がエラーに出ても表示しない
const mask = (text: string) =>
	text.replaceAll(env.dbUrl, "<STAGING_DB_URL>").replace(/postgres(?:ql)?:\/\/\S+/g, "<db-url>");
process.stdout.write(mask(result.stdout ?? ""));
process.stderr.write(mask(result.stderr ?? ""));
process.exit(result.status ?? 1);
