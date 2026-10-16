// ステージング用スクリプトの共通部分。.env.staging だけを読み、本番を指していたら止める。
// 値（キー・パスワード）はログに出さないこと。

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function parseEnvFile(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	const env: Record<string, string> = {};
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
		if (match) env[match[1]] = match[2];
	}
	return env;
}

function projectRef(url: string | undefined): string | null {
	return url ? (/^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? null) : null;
}

export type StagingEnv = {
	url: string;
	publishableKey: string;
	secretKey: string;
	dbUrl: string;
	seedPassword: string;
	ref: string;
};

/** .env.staging を読み、ステージングだと確かめられたときだけ返す */
export function loadStagingEnv(): StagingEnv {
	const staging = parseEnvFile(`${ROOT}.env.staging`);
	const production = parseEnvFile(`${ROOT}.env`);
	if (staging.PUBLIC_ANIPOLIS_ENV !== "staging") {
		throw new Error(".env.staging が無いか、PUBLIC_ANIPOLIS_ENV=staging が書かれていません");
	}
	const ref = projectRef(staging.PUBLIC_SUPABASE_URL);
	if (!ref) throw new Error(".env.staging の PUBLIC_SUPABASE_URL が https://<ref>.supabase.co の形ではありません");
	const productionRef = projectRef(production.PUBLIC_SUPABASE_URL);
	if (productionRef && productionRef === ref) {
		throw new Error(".env.staging が本番のプロジェクトを指しています。中止します");
	}
	const dbUrl = staging.STAGING_DB_URL ?? "";
	if (dbUrl && !dbUrl.includes(ref)) {
		throw new Error("STAGING_DB_URL が PUBLIC_SUPABASE_URL と別のプロジェクトを指しています。中止します");
	}
	return {
		url: staging.PUBLIC_SUPABASE_URL,
		publishableKey: staging.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
		secretKey: staging.SUPABASE_SECRET_KEY ?? "",
		dbUrl,
		seedPassword: staging.STAGING_SEED_PASSWORD ?? "",
		ref,
	};
}
