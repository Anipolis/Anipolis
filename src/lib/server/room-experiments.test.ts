import { describe, expect, it } from "vitest";
import { isSchemaUnavailableError } from "./room-experiments";

describe("isSchemaUnavailableError", () => {
	it("detects missing schema and schema-cache errors", () => {
		expect(isSchemaUnavailableError({ code: "42P01", message: "relation does not exist" })).toBe(true);
		expect(isSchemaUnavailableError({ code: "42703", message: "column does not exist" })).toBe(true);
		expect(
			isSchemaUnavailableError({ code: "PGRST205", message: "Could not find the table in the schema cache" }),
		).toBe(true);
		expect(isSchemaUnavailableError({ message: "Could not find a relationship in the schema cache" })).toBe(true);
	});

	it("does not hide permission or runtime errors", () => {
		expect(isSchemaUnavailableError({ code: "42501", message: "permission denied" })).toBe(false);
		expect(isSchemaUnavailableError({ message: "could not find user profile" })).toBe(false);
		expect(isSchemaUnavailableError(new Error("network timeout"))).toBe(false);
		expect(isSchemaUnavailableError(null)).toBe(false);
	});
});
