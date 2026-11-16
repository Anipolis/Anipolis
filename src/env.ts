import { defineEnvVars } from "@sveltejs/kit/env";

// 値が無くてもよい変数に使う。schema を付けない変数は、値が無いと起動時（static はビルド時）に失敗する
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
	// 公開（ブラウザにも渡る）
	PUBLIC_SUPABASE_URL: { public: true },
	PUBLIC_SUPABASE_PUBLISHABLE_KEY: { public: true, schema: optional },
	PUBLIC_SUPABASE_ANON_KEY: { public: true, schema: optional },
	PUBLIC_ANIPOLIS_ENV: { public: true, schema: optional },
	PUBLIC_CLOSED_BETA: { public: true, schema: optional },
	PUBLIC_PASSKEY_ENABLED: { public: true, schema: optional },

	// サーバーだけ。実行時に読む
	SUPABASE_SECRET_KEY: { schema: optional },
	SUPABASE_SERVICE_ROLE_KEY: { schema: optional },
	MULTI_ACCOUNT_COOKIE_SECRET: { schema: optional },
	ADMIN_MFA_REQUIRED: { schema: optional },
	DISCORD_REQUIRED_ROLE_ID: { schema: optional },

	// サーバーだけ。ビルド時に埋め込む
	DISCORD_BOT_TOKEN: { static: true },
	DISCORD_GUILD_ID: { static: true },
});
