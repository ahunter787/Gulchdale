import pg from "pg";
export function applicationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	const value = env.GULCHDALE_DATABASE_URL;
	if (!value) throw new Error("GULCHDALE_DATABASE_URL is required for foundation commands");
	const url = new URL(value);
	if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.pathname.startsWith("/gulchdale"))
		throw new Error("Use an application-owned gulchdale database, never ecosystem databases");
	return value;
}
export function applicationPool(url = applicationDatabaseUrl()): pg.Pool {
	return new pg.Pool({
		connectionString: url,
		connectionTimeoutMillis: 1500,
		idleTimeoutMillis: 3000,
		max: 4,
		statement_timeout: 10000,
		application_name: "gulchdale-foundation",
	});
}
