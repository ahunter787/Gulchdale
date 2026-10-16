// Read-only live volume; snapshot writes only to the disposable helper's tmpfs.
import { DatabaseSync, backup } from "node:sqlite";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

const sourcePath = process.argv[2] ?? "/source/mailpit.db";
const snapshotPath = process.argv[3] ?? "/tmp/mailpit.db";
const source = new DatabaseSync(sourcePath, { readOnly: true });
try {
	source.exec("PRAGMA busy_timeout = 5000");
	await backup(source, snapshotPath);
} finally {
	source.close();
}
const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
try {
	const results = snapshot.prepare("PRAGMA integrity_check").all();
	if (results.length !== 1 || Object.values(results[0])[0] !== "ok") {
		throw new Error("Mailpit snapshot failed SQLite integrity_check");
	}
} finally {
	snapshot.close();
}
await pipeline(createReadStream(snapshotPath), process.stdout);
