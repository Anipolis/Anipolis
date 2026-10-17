// ステージングに migration を流す。CLI のリンク先（本番）は使わず、--db-url で接続先を明示する。
//   pnpm staging:db-push            … 流す前に一覧だけ見る（dry-run）
//   pnpm staging:db-push -- --apply … 実際に流す

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { loadStagingEnv } from "./env.ts";

const env = loadStagingEnv();
if (!env.dbUrl) throw new Error(".env.staging に STAGING_DB_URL がありません");

const apply = process.argv.includes("--apply");
// パスワードの記号がシェルで崩れないよう、シェルを通さずに CLI を直接起動する。
// 実行ファイルの場所は CLI の版で変わる（dist/supabase.js のときと bin/supabase のときがある）ので、
// パッケージの bin の定義から探す。JS なら node で、そうでなければそのまま起動する
const manifestPath = createRequire(import.meta.url).resolve("supabase/package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { bin?: string | Record<string, string> };
const binPath = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.["supabase"];
if (!binPath) throw new Error("supabase パッケージに実行ファイルの定義（bin）がありません");
const bin = join(dirname(manifestPath), binPath);
const pushArgs = ["db", "push", "--db-url", env.dbUrl, ...(apply ? ["--yes"] : ["--dry-run"])];
const [command, args] = /\.[cm]?js$/.test(bin) ? [process.execPath, [bin, ...pushArgs]] : [bin, pushArgs];
console.log(`ステージング（${env.ref}）に migration を${apply ? "流します" : "流す前の確認をします（dry-run）"}`);

const result = spawnSync(command, args, { stdio: ["inherit", "pipe", "pipe"], encoding: "utf8" });
if (result.error) throw result.error;
// 接続文字列（パスワード入り）がエラーに出ても表示しない
const mask = (text: string) =>
	text.replaceAll(env.dbUrl, "<STAGING_DB_URL>").replace(/postgres(?:ql)?:\/\/\S+/g, "<db-url>");
process.stdout.write(mask(result.stdout ?? ""));
process.stderr.write(mask(result.stderr ?? ""));
process.exit(result.status ?? 1);
