// anime-offline-database 由来レコードの ODbL 公開 JSON を事前生成して
// public-data バケット（migration 123）へアップロードする。
// syobocal-sync ワークフローの週次インポート成功後に実行され、
// /api/data/anime-catalog はこの成果物をストリーミング配信する。

import { createClient } from "@supabase/supabase-js";
import {
	ANIME_CATALOG_EXPORT_BUCKET,
	ANIME_CATALOG_EXPORT_OBJECT,
	buildAnimeCatalogExport,
} from "../src/lib/anime-catalog-export.ts";

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const serviceRoleKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) before running the exporter.",
		);
	}
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

async function main() {
	const supabase = getSupabaseClient();
	const payload = await buildAnimeCatalogExport(supabase);
	const body = JSON.stringify(payload);
	console.log(`Built catalog export: ${payload["count"]} records, ${(body.length / 1024 / 1024).toFixed(1)} MiB.`);

	const { error } = await supabase.storage
		.from(ANIME_CATALOG_EXPORT_BUCKET)
		.upload(ANIME_CATALOG_EXPORT_OBJECT, body, { contentType: "application/json", upsert: true });
	if (error) throw new Error(`Could not upload the catalog export: ${error.message}`);
	console.log(`Uploaded ${ANIME_CATALOG_EXPORT_BUCKET}/${ANIME_CATALOG_EXPORT_OBJECT}.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
