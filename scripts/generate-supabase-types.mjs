import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const executable = process.platform === "win32" ? "supabase.cmd" : "supabase";
const result = spawnSync(executable, ["gen", "types", "typescript", "--linked", "--schema", "public"], {
	encoding: "utf8",
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
