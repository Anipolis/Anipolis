import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/197_post_created_at_server_time.sql", import.meta.url),
	"utf8",
);

describe("post created_at server time migration", () => {
	it("利用者からの INSERT は今の時刻にし、UPDATE では前の値のままにする", () => {
		expect(migration).toMatch(
			/IF TG_OP = 'INSERT' THEN\s+NEW\.created_at := now\(\);\s+ELSE\s+NEW\.created_at := OLD\.created_at;\s+END IF;/,
		);
	});

	it("service role（取り込み・seed）は指定した日時をそのまま使える", () => {
		expect(migration).toMatch(
			/IF COALESCE\(auth\.role\(\), ''\) NOT IN \('anon', 'authenticated'\) THEN\s+RETURN NEW;\s+END IF;/,
		);
		// 呼んだ人のロールで判定するので、SECURITY DEFINER にしない
		expect(migration).toMatch(/keep_server_created_at\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY INVOKER/);
	});

	it("投稿とリポストの両方に、INSERT と created_at の UPDATE で掛ける", () => {
		for (const table of ["posts", "reposts"]) {
			expect(migration).toMatch(
				new RegExp(
					`CREATE TRIGGER keep_server_created_at\\s+BEFORE INSERT OR UPDATE OF created_at ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.keep_server_created_at\\(\\);`,
				),
			);
		}
	});
});
