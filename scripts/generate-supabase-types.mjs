import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cliArguments = ["exec", "supabase", "gen", "types", "typescript", "--linked", "--schema", "public"];
const windows = process.platform === "win32";
const executable = windows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
const arguments_ = windows ? ["/d", "/s", "/c", `pnpm ${cliArguments.join(" ")}`] : cliArguments;
const result = spawnSync(executable, arguments_, {
	encoding: "utf8",
	maxBuffer: 16 * 1024 * 1024,
	stdio: ["inherit", "pipe", "inherit"],
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!result.stdout.includes("export type Database")) {
	throw new Error("Supabase type generation returned an unexpected result; database.types.ts was not changed.");
}

const target = resolve("src/lib/supabase/database.types.ts");
const temporary = `${target}.tmp`;

try {
	writeFileSync(temporary, result.stdout);
	renameSync(temporary, target);
} finally {
	if (existsSync(temporary)) rmSync(temporary);
}
