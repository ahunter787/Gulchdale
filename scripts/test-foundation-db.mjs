// Own disposable containers only. Never touches the development ecosystem.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
const name = "gulchdale-foundation-check-" + crypto.randomBytes(5).toString("hex");
let created = false;
const run = (args) => {
	const r = spawnSync("docker", args, { stdio: "inherit" });
	if (r.status !== 0) throw new Error("Foundation Docker check failed");
};
try {
	run([
		"run",
		"-d",
		"--name",
		name,
		"--label",
		"gulchdale.test=foundation",
		"-e",
		"POSTGRES_DB=gulchdale_test",
		"-e",
		"POSTGRES_USER=gulchdale",
		"-e",
		"POSTGRES_PASSWORD=disposable-test-only",
		"postgres:17-alpine",
	]);
	created = true;
	run([
		"exec",
		name,
		"sh",
		"-c",
		"for i in $(seq 1 30); do pg_isready -U gulchdale -d gulchdale_test && exit 0; sleep 1; done; exit 1",
	]);
	run([
		"run",
		"--rm",
		"--network",
		"container:" + name,
		"--mount",
		"type=bind,source=" + process.cwd() + ",target=/workspace,readonly",
		"-w",
		"/workspace",
		"-e",
		"GULCHDALE_DATABASE_URL=postgres://gulchdale:disposable-test-only@127.0.0.1:5432/gulchdale_test",
		"node:22-alpine",
		"sh",
		"-c",
		"npm run db:migrate && npm run db:migrate && npm run test-foundation-db",
	]);
} finally {
	// Exact container created above, no published port and no persistent named volume.
	if (created) spawnSync("docker", ["rm", "--force", "--volumes", name], { stdio: "inherit" });
}
