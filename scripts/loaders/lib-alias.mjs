// スクリプトからアプリのコード（src/lib）をそのまま読み込むためのローダー。
// SvelteKit の $lib/ を src/lib/ に読み替え、拡張子の無い相対 import に .ts を補う
// （node --experimental-strip-types は拡張子を補わない）。
//   node --import ./scripts/loaders/register-lib-alias.mjs --experimental-strip-types scripts/xxx.ts
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIB_ROOT = new URL("../../src/lib/", import.meta.url);

function withTsExtension(url) {
	const path = fileURLToPath(url);
	if (/\.[cm]?[jt]s$/.test(path) && existsSync(path)) return url;
	for (const candidate of [`${path}.ts`, `${path}/index.ts`]) {
		if (existsSync(candidate)) return pathToFileURL(candidate).href;
	}
	return url;
}

export async function resolve(specifier, context, nextResolve) {
	if (specifier.startsWith("$lib/")) {
		return nextResolve(withTsExtension(new URL(specifier.slice("$lib/".length), LIB_ROOT).href), context);
	}
	if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
		return nextResolve(withTsExtension(new URL(specifier, context.parentURL).href), context);
	}
	return nextResolve(specifier, context);
}
