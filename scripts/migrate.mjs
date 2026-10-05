import { runner } from "node-pg-migrate";
import { applicationDatabaseUrl } from "../dist/src/gulchdale/database.js";
await runner({
	databaseUrl: applicationDatabaseUrl(),
	dir: "migrations",
	migrationsTable: "gulchdale_migrations",
	direction: "up",
	checkOrder: true,
	singleTransaction: true,
	log: () => {},
});
console.log("Application foundation migrations applied.");
