import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { before, after, describe, it } from "mocha";
import { applicationPool, applicationDatabaseUrl } from "../src/gulchdale/database.js";
import { FoundationRepository } from "../src/gulchdale/repositories.js";
import { loadCommittedWorkspace } from "../src/gulchdale/import.js";
import { bytesHash, type ReleaseReference, type CardRecord } from "../src/gulchdale/domain.js";

describe("Gulchdale application PostgreSQL", function () {
	this.timeout(30000);
	const url = applicationDatabaseUrl();
	if (new URL(url).pathname !== "/gulchdale_test")
		throw new Error("Integration tests require a disposable gulchdale_test database");
	const db = applicationPool(url),
		repo = new FoundationRepository(db),
		w = loadCommittedWorkspace();
	let initial: string;
	before(async () => {
		await db.query("SELECT 1 FROM gulchdale.workspaces");
	});
	after(async () => {
		await db.end();
	});
	it("stores exact immutable snapshots and idempotent normalized staging", async () => {
		expect(await repo.import(w)).to.equal(w.id);
		expect(await repo.import(w)).to.equal(w.id);
		const counts = await db.query(
			"SELECT (SELECT count(*) FROM gulchdale.workspaces) AS workspaces,(SELECT count(*) FROM gulchdale.source_snapshots) AS sources"
		);
		expect(counts.rows[0]).to.deep.equal({ workspaces: "1", sources: "6" });
		const stored = await repo.workspace(w.id);
		expect(stored.sources[0].bytes).to.deep.equal(w.sources[0].bytes);
		expect(await repo.catalog(w.id)).to.have.length(w.cards.length);
		for (const sql of [
			"UPDATE gulchdale.source_snapshots SET content='bad'::bytea",
			"UPDATE gulchdale.cards SET name='bad'",
			"UPDATE gulchdale.workspaces SET sealed=false",
		]) {
			let failed = false;
			try {
				await db.query(sql);
			} catch {
				failed = true;
			}
			expect(failed).to.equal(true);
		}
	});
	it("requires a reviewed diff and creates immutable component references", async () => {
		const diff = await repo.diff(w.id);
		let rejected = false;
		try {
			await repo.promote(w.id, "0".repeat(64));
		} catch {
			rejected = true;
		}
		expect(rejected).to.equal(true);
		initial = await repo.promote(w.id, diff.digest);
		const env = await repo.release(initial),
			refs = env.payload.reference as ReleaseReference;
		expect(Object.keys(refs).sort()).to.deep.equal(["engine", "metadata", "pool", "rules"]);
		expect((await repo.release(refs.pool)).payload.entries).to.have.length(w.pool.length);
		expect((await repo.compareLegacy(w)).reconciled).to.equal(true);
		expect((await repo.compareLegacy(w)).matches).to.deep.equal({
			pool: true,
			rules: true,
			engine: true,
			sources: true,
			counts: true,
		});
		let immutable = false;
		try {
			await db.query("UPDATE gulchdale.releases SET payload='{}'");
		} catch {
			immutable = true;
		}
		expect(immutable).to.equal(true);
		const fresh = await repo.diff(w.id);
		expect(await repo.promote(w.id, fresh.digest)).to.equal(initial);
		expect((await db.query("SELECT count(*) FROM gulchdale.promotions")).rows[0].count).to.equal("1");
	});
	it("refresh cannot overwrite overrides; stale reviews cannot promote", async () => {
		const card = w.cards.find((c) => c.name === "Swan Song")!;
		const firstDiff = await repo.diff(w.id);
		await db.query("INSERT INTO gulchdale.human_overrides VALUES($1,$2,$3)", [
			card.id,
			"affinity.goblin",
			JSON.stringify(0.9),
		]);
		let stale = false;
		try {
			await repo.promote(w.id, firstDiff.digest);
		} catch {
			stale = true;
		}
		expect(stale).to.equal(true);
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "gulchdale-source-refresh-"));
		for (const dir of ["data/compiler/source", "data/cubes", "compiler/config"]) {
			fs.mkdirSync(path.join(root, dir), { recursive: true });
			// Only the six small committed foundation inputs are copied, not card databases.
		}
		for (const s of w.sources) fs.copyFileSync(s.path, path.join(root, s.path));
		const source = path.join(root, "data/compiler/source/gulchdale.csv");
		const refreshed = fs
			.readFileSync(source, "utf8")
			.replace('"Swan Song",1,"Instant",U', '"Swan Song",1,"Instant",W');
		fs.writeFileSync(source, refreshed);
		const manifestPath = path.join(root, "data/cubes/gulchdale.manifest.json");
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
		manifest.cube.sourceSha256 = bytesHash(Buffer.from(refreshed));
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));
		const next = loadCommittedWorkspace(root);
		expect(next.id).not.to.equal(w.id);
		await repo.import(next);
		const diff = await repo.diff(next.id);
		const promoted = await repo.promote(next.id, diff.digest);
		const refs = (await repo.release(promoted)).payload.reference as ReleaseReference;
		const metadata = (await repo.release(refs.metadata)).payload.cards as CardRecord[];
		// Equal counts and an unchanged legacy artifact are not enough to hide refreshed sources.
		const comparison = await repo.compareLegacy(w);
		expect(comparison.reconciled).to.equal(false);
		expect((comparison.matches as Record<string, boolean>).sources).to.equal(false);
		expect(metadata.find((c) => c.id === card.id)!.data["affinity.goblin"]).to.equal(0.9);
		expect((await db.query("SELECT count(*) FROM gulchdale.human_overrides")).rows[0].count).to.equal("1");
		expect((await repo.release(initial)).hash).to.equal(initial);
	});
});
