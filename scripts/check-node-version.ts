import { readFileSync } from "node:fs";

// mise.toml を Node.js バージョンの正本にしている。Cloudflare（Pages / Workers Builds）は
// .node-version を読むので、ずれると CI とデプロイで違う Node.js が動く。
const MISE_PATH = "mise.toml";
const NODE_VERSION_PATH = ".node-version";
const PACKAGE_JSON_PATH = "package.json";

function readMiseNodeVersion(): string {
	const source = readFileSync(MISE_PATH, "utf8");
	const match = source.match(/^\s*node\s*=\s*"([^"]+)"/m);
	if (!match?.[1]) throw new Error(`${MISE_PATH} に [tools] node のバージョンが見つかりません`);
	return match[1];
}

// pnpm 12 は .npmrc の engine-strict を読まず、pnpm-workspace.yaml の engineStrict は
// Dependabot（Node.js 24 固定）のインストールを止めるため使わない。
// 実行中の Node.js が package.json の engines.node（">=x.y.z" 形式）を満たすかをここで検証する。
function readEnginesNodeMinimum(): string {
	const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
		engines?: { node?: string };
	};
	const range = pkg.engines?.node;
	const match = range?.match(/^>=\s*(\d+\.\d+\.\d+)$/);
	if (!match?.[1]) {
		throw new Error(`${PACKAGE_JSON_PATH} の engines.node (${range}) は ">=x.y.z" 形式のみ対応しています`);
	}
	return match[1];
}

function isAtLeast(actual: string, minimum: string): boolean {
	// プレリリース接尾辞（例: 27.0.0-nightly）は除いて数値部分だけを比較する。
	const a = actual.split("-")[0]?.split(".").map(Number) ?? [];
	const m = minimum.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		const diff = (a[i] ?? 0) - (m[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return true;
}

const enginesMinimum = readEnginesNodeMinimum();
if (!isAtLeast(process.versions.node, enginesMinimum)) {
	console.error(
		`実行中の Node.js (${process.versions.node}) が ${PACKAGE_JSON_PATH} の engines.node (>=${enginesMinimum}) を満たしません。` +
			`mise install で ${MISE_PATH} のバージョンを入れてください。`,
	);
	process.exit(1);
}

const expected = readMiseNodeVersion();
const actual = readFileSync(NODE_VERSION_PATH, "utf8").trim();

if (actual !== expected) {
	console.error(
		`${NODE_VERSION_PATH} (${actual}) が ${MISE_PATH} の node (${expected}) と一致しません。` +
			`${NODE_VERSION_PATH} を ${expected} に更新してください。`,
	);
	process.exit(1);
}

console.log(`${NODE_VERSION_PATH} matches ${MISE_PATH} (${expected}).`);
