import { spawnSync } from "node:child_process";
import fs from "node:fs";
const steps = [
	["npm", ["run", "build-server"]],
	["npm", ["run", "client-type-check"]],
	["npm", ["run", "build-client"]],
	[process.env.GULCHDALE_PYTHON ?? "python3", ["-m", "pytest", "compiler/tests"]],
	["npm", ["run", "test-gulchdale"]],
	["npm", ["run", "test-gulchdale-acceptance"]],
	["npm", ["run", "test-foundation"]],
	["npm", ["run", "test-supply"]],
	["docker", ["build", "--tag", "gulchdale-legacy-check", "."]],
];
for (const [cmd, args] of steps) {
	console.log("\nLegacy verification: " + cmd + " " + args.join(" "));
	const result = spawnSync(cmd, args, {
		stdio: "inherit",
		env: { ...process.env, GULCHDALE_RUNTIME_MODE: "legacy", PYTHONPATH: "compiler" },
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("\nLegacy baseline verified; no content promotion or runtime cutover performed.");
