import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		expect: { requireAssertions: true },
		projects: [
			{
				extends: "./vite.config.ts",
				test: {
					name: "client",
					environment: "happydom",
					include: ["src/**/*.svelte.test.ts"],
					exclude: ["src/lib/server/**"],
				},
			},
			{
				extends: "./vite.config.ts",
				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.test.ts"],
					exclude: ["src/**/*.svelte.test.ts"],
				},
			},
		],
	},
});
