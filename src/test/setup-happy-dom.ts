import { Window } from "happy-dom";

// Node.js 26 は localStorage グローバルを常に定義する（--localstorage-file 未指定だと undefined）。
// その状態では happy-dom の GlobalWindow が localStorage を初期化しないため、テスト環境で補う。
if (typeof globalThis.localStorage === "undefined") {
	const isolated = new Window();
	for (const target of [globalThis, window]) {
		Object.defineProperty(target, "localStorage", {
			value: isolated.localStorage,
			configurable: true,
			writable: true,
		});
	}
}
