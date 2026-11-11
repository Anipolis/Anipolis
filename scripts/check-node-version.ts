import { readFileSync } from "node:fs";

// mise.toml を Node.js バージョンの正本にしている。Cloudflare（Pages / Workers Builds）は
// .node-version を読むので、ずれると CI とデプロイで違う Node.js が動く。
const MISE_PATH = "mise.toml";
const NODE_VERSION_PATH = ".node-version";

function readMiseNodeVersion(): string {
	const source = readFileSync(MISE_PATH, "utf8");
	const match = source.match(/^\s*node\s*=\s*"([^"]+)"/m);
	if (!match?.[1]) throw new Error(`${MISE_PATH} に [tools] node のバージョンが見つかりません`);
	return match[1];
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
