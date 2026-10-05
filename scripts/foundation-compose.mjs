// Local operator wrapper. Generated credentials remain ignored and unpublished.
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
const [command, ...args] = process.argv.slice(2);
const commands = ["init", "migrate", "import", "validate", "diff", "promote", "catalog", "release", "compare"];
if (!commands.includes(command)) throw new Error("Commands: " + commands.join(", "));
const config = ".gulchdale/application.env";
if (command === "init" && !fs.existsSync(config)) {
	fs.mkdirSync(".gulchdale", { recursive: true });
	const password = crypto.randomBytes(32).toString("hex");
	fs.writeFileSync(
		config,
		"GULCHDALE_DB_PASSWORD=" +
			password +
			"\nGULCHDALE_DATABASE_URL=postgres://gulchdale:" +
			password +
			"@database:5432/gulchdale\n",
		{ mode: 0o600, flag: "wx" }
	);
	console.log("Created private application DB credentials in ignored " + config);
}
if (!fs.existsSync(config))
	throw new Error("Run foundation:compose -- init first, or provision the private application env file");
const compose = ["compose", "--env-file", config, "--profile", "foundation"];
function run(parts) {
	const r = spawnSync("docker", [...compose, ...parts], { stdio: "inherit" });
	if (r.status !== 0) process.exit(r.status ?? 1);
}
if (command === "init") {
	if (args.length) throw new Error("init accepts no arguments");
	run(["up", "--detach", "--wait", "database"]);
	run(["build", "foundation-tools"]);
	run(["run", "--rm", "--entrypoint", "node", "foundation-tools", "scripts/migrate.mjs"]);
	console.log(
		"Application DB ready. Import, diff and explicitly review/promote next. Legacy application was not restarted."
	);
} else if (command === "migrate") {
	if (args.length) throw new Error("migrate accepts no arguments");
	run(["run", "--rm", "--entrypoint", "node", "foundation-tools", "scripts/migrate.mjs"]);
} else run(["run", "--rm", "foundation-tools", command, ...args]);
