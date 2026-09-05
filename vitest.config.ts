import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		expect: { requireAssertions: true },
		projects: [
			{
				extends: "./vite.config.js",
				resolve: { conditions: ["browser"] },
				test: {
					name: "client",
					environment: "happy-dom",
					include: ["src/**/*.svelte.test.ts"],
					exclude: ["src/lib/server/**"],
				},
			},
			{
				extends: "./vite.config.js",
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
