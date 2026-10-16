import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("./backup-mailpit.mjs", import.meta.url));
test("online backup includes committed WAL data while source remains open", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "gulchdale-backup-test-"));
	const source = path.join(dir, "live.db");
	const output = path.join(dir, "snapshot.db");
	const live = new DatabaseSync(source);
	try {
		live.exec(
			"PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES ('committed in WAL');"
		);
		const result = spawnSync(process.execPath, [helper, source, output], { maxBuffer: 1024 * 1024 });
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stderr.toString());
		assert.deepEqual(result.stdout, readFileSync(output));
		const snapshot = new DatabaseSync(output, { readOnly: true });
		try {
			assert.equal(snapshot.prepare("SELECT value FROM evidence").get().value, "committed in WAL");
			assert.equal(snapshot.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
		} finally {
			snapshot.close();
		}
		assert.equal(live.prepare("SELECT count(*) AS n FROM evidence").get().n, 1);
	} finally {
		live.close();
	}
});

test("missing or corrupt SQLite source fails instead of emitting a usable backup", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "gulchdale-backup-failure-"));
	const corrupt = path.join(dir, "corrupt.db");
	writeFileSync(corrupt, "not a database");
	for (const source of [path.join(dir, "missing.db"), corrupt]) {
		const result = spawnSync(process.execPath, [helper, source, path.join(dir, "snapshot.db")]);
		assert.ifError(result.error);
		assert.notEqual(result.status, 0);
		assert.equal(result.stdout.length, 0);
	}
});
