import { json } from "@sveltejs/kit";
import {
	dedupeEntries,
	MAX_IMPORT_BYTES,
	MAX_IMPORT_ENTRIES,
	type ParseResult,
	parseMylistFile,
} from "$lib/mylist-transfer";
import { importMylistEntries } from "$lib/server/actions";
import { MULTIPART_OVERHEAD_BYTES, readFormDataWithLimit } from "$lib/server/upload";
import type { RequestHandler } from "./$types";

// マイリストの読み込み（#358）。MyAnimeList のエクスポート（.xml / .xml.gz）か Anipolis の CSV を受け取る。
// 送るファイルは gzip のままでもよい（MAL のエクスポートは .xml.gz で落ちてくる）。
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

async function readText(file: File): Promise<string | "too_large" | "invalid"> {
	const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	const gzipped = head[0] === 0x1f && head[1] === 0x8b;
	const stream = gzipped ? file.stream().pipeThrough(new DecompressionStream("gzip")) : file.stream();
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			// gzip を解くと大きくなるので、解いた後の大きさでも上限を見る
			if (total > MAX_IMPORT_BYTES) {
				await reader.cancel();
				return "too_large";
			}
			chunks.push(value);
		}
	} catch {
		return "invalid";
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return "invalid";
	}
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return json({ message: "ログインが必要です" }, { status: 401 });

	const form = await readFormDataWithLimit(request, MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES);
	if (form === "too_large") return json({ message: "ファイルが大きすぎます（5MB まで）" }, { status: 413 });
	if (form === "invalid") return json({ message: "ファイルを読み込めませんでした" }, { status: 400 });
	const file = form.get("file");
	if (!(file instanceof File) || file.size === 0) {
		return json({ message: "ファイルを選んでください" }, { status: 400 });
	}
	const overwrite = form.get("overwrite") === "true";

	const text = await readText(file);
	if (text === "too_large") return json({ message: "ファイルが大きすぎます（解凍後 10MB まで）" }, { status: 413 });
	if (text === "invalid") {
		return json(
			{ message: "ファイルを読み込めませんでした（UTF-8 の XML か CSV にしてください）" },
			{ status: 400 },
		);
	}

	let parsed: ParseResult;
	try {
		parsed = parseMylistFile(text);
	} catch (cause) {
		return json(
			{ message: cause instanceof Error ? cause.message : "ファイルの形式が分かりません" },
			{ status: 400 },
		);
	}
	const entries = dedupeEntries(parsed.entries);
	if (entries.length === 0) {
		return json(
			{ message: "読み込める作品がありませんでした", invalid: parsed.invalid.slice(0, 100) },
			{ status: 400 },
		);
	}
	if (entries.length > MAX_IMPORT_ENTRIES) {
		return json(
			{ message: `一度に読み込めるのは ${MAX_IMPORT_ENTRIES.toLocaleString()} 件までです` },
			{ status: 413 },
		);
	}

	const outcome = await importMylistEntries(supabase, user.id, entries, overwrite);
	if (!outcome.ok) return json({ message: outcome.message }, { status: outcome.status });
	return json({
		...outcome.result,
		total: entries.length,
		invalid: parsed.invalid.slice(0, 100),
		invalidCount: parsed.invalid.length,
	});
};
