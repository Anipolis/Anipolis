import { describe, expect, it } from "vitest";
import { PRODUCTION_SUPABASE_REF, supabaseProjectRef, supabaseTarget } from "./supabase-target";

const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
const STAGING_URL = "https://abcdefghijklmnopqrst.supabase.co";

describe("supabaseProjectRef", () => {
	it("プロジェクト URL から ID を取り出す", () => {
		expect(supabaseProjectRef(STAGING_URL)).toBe("abcdefghijklmnopqrst");
		expect(supabaseProjectRef(`${STAGING_URL}/rest/v1/`)).toBe("abcdefghijklmnopqrst");
	});

	it("Supabase の URL でなければ null", () => {
		expect(supabaseProjectRef(undefined)).toBeNull();
		expect(supabaseProjectRef("http://127.0.0.1:54321")).toBeNull();
		expect(supabaseProjectRef("https://abc.supabase.co.example.com")).toBeNull();
	});
});

describe("supabaseTarget", () => {
	it("目印が staging で URL も本番でなければ staging", () => {
		expect(supabaseTarget(STAGING_URL, "staging")).toBe("staging");
	});

	it("URL が本番なら、目印が staging でも production", () => {
		expect(supabaseTarget(PROD_URL, "staging")).toBe("production");
		expect(supabaseTarget(PROD_URL, undefined)).toBe("production");
	});

	it("目印が無い本番以外の URL や、URL が無いときは unknown", () => {
		expect(supabaseTarget(STAGING_URL, undefined)).toBe("unknown");
		expect(supabaseTarget(undefined, "staging")).toBe("unknown");
	});
});
