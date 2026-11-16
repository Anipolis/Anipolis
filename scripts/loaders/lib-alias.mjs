// スクリプトからアプリのコード（src/lib）をそのまま読み込むためのローダー。
// 拡張子の無い相対 import に .ts を補う（node --experimental-strip-types は拡張子を補わない）。
// #lib/ は package.json の imports で Node が解決するため、ここでは扱わない。
//   node --import ./scripts/loaders/register-lib-alias.mjs --experimental-strip-types scripts/xxx.ts
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

function withTsExtension(url) {
	const path = fileURLToPath(url);
	if (/\.[cm]?[jt]s$/.test(path) && existsSync(path)) return url;
	for (const candidate of [`${path}.ts`, `${path}/index.ts`]) {
		if (existsSync(candidate)) return pathToFileURL(candidate).href;
	}
	return url;
}

export async function resolve(specifier, context, nextResolve) {
	if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
		return nextResolve(withTsExtension(new URL(specifier, context.parentURL).href), context);
	}
	return nextResolve(specifier, context);
}
