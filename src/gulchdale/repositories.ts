import type pg from "pg";
import {
	digest,
	releasesFor,
	type CardRecord,
	type Workspace,
	type HumanOverride,
	type Release,
	type Data,
	type ReleaseReference,
} from "./domain.js";
import { validateWorkspace, workspacePayload } from "./import.js";
import { valueDiff } from "./diff.js";
type Queryable = Pick<pg.PoolClient, "query">;
export interface CatalogRepository {
	catalog(workspaceId: string): Promise<CardRecord[]>;
}
export interface ReleaseRepository {
	live(): Promise<string | null>;
	release(hash: string): Promise<Release>;
}
export class FoundationRepository implements CatalogRepository, ReleaseRepository {
	constructor(private readonly db: pg.Pool) {}
	private async transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
		const c = await this.db.connect();
		try {
			await c.query("BEGIN");
			const r = await fn(c);
			await c.query("COMMIT");
			return r;
		} catch (e) {
			await c.query("ROLLBACK");
			throw e;
		} finally {
			c.release();
		}
	}
	async import(w: Workspace): Promise<string> {
		validateWorkspace(w);
		return this.transaction(async (c) => {
			await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [w.id]);
			const existing = await c.query("SELECT sealed,payload FROM gulchdale.workspaces WHERE id=$1", [w.id]);
			if (existing.rowCount) {
				if (!existing.rows[0].sealed || digest(existing.rows[0].payload) !== digest(workspacePayload(w)))
					throw new Error("Stored workspace conflicts with deterministic import");
				return w.id;
			}
			for (const s of w.sources)
				await c.query(
					"INSERT INTO gulchdale.source_snapshots(id,kind,source_path,content) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
					[s.id, s.kind, s.path, s.bytes]
				);
			await c.query("INSERT INTO gulchdale.workspaces(id,payload) VALUES($1,$2)", [w.id, workspacePayload(w)]);
			for (const s of w.sources)
				await c.query("INSERT INTO gulchdale.workspace_sources VALUES($1,$2) ON CONFLICT DO NOTHING", [
					w.id,
					s.id,
				]);
			// Fixed table/column names below, never arbitrary imported SQL identifiers.
			await c.query(
				`INSERT INTO gulchdale.cards SELECT $1,x.id,x.name,x.data FROM jsonb_to_recordset($2::jsonb) AS x(id text,name text,data jsonb)`,
				[w.id, JSON.stringify(w.cards)]
			);
			await c.query(
				`INSERT INTO gulchdale.printings SELECT $1,x.id,x."cardId",x.set,x."collectorNumber",x.data FROM jsonb_to_recordset($2::jsonb) AS x(id text,"cardId" text,set text,"collectorNumber" text,data jsonb)`,
				[w.id, JSON.stringify(w.printings)]
			);
			await c.query(
				`INSERT INTO gulchdale.pool_entries SELECT $1,x.id,x."cardId",x."printingId",x.quantity,x.sheets,x.tags,x.data FROM jsonb_to_recordset($2::jsonb) AS x(id text,"cardId" text,"printingId" text,quantity integer,sheets text[],tags text[],data jsonb)`,
				[w.id, JSON.stringify(w.pool)]
			);
			for (const p of w.commanders)
				await c.query("INSERT INTO gulchdale.commanders VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [
					w.id,
					p.cardId,
					p.data,
				]);
			for (const p of w.personalInjections)
				await c.query("INSERT INTO gulchdale.personal_injections VALUES($1,$2,$3,$4)", [
					w.id,
					p.id,
					p.cardId,
					p,
				]);
			for (const p of w.supplyPolicies)
				await c.query("INSERT INTO gulchdale.supply_policies VALUES($1,$2,$3)", [w.id, p.id, p]);
			for (const p of w.archetypes)
				await c.query("INSERT INTO gulchdale.archetypes VALUES($1,$2,$3,$4)", [
					w.id,
					p.id,
					p.capacity ?? null,
					p,
				]);
			for (const p of w.tribes) await c.query("INSERT INTO gulchdale.tribes VALUES($1,$2,$3)", [w.id, p.id, p]);
			for (const p of w.worldTags)
				await c.query("INSERT INTO gulchdale.world_tags VALUES($1,$2,$3)", [w.id, p.id, p]);
			for (const p of w.affinities)
				await c.query("INSERT INTO gulchdale.card_affinities VALUES($1,$2,$3,$4)", [
					w.id,
					p.cardId,
					p.archetypeId,
					p.score,
				]);
			await c.query("UPDATE gulchdale.workspaces SET sealed=true WHERE id=$1", [w.id]);
			return w.id;
		});
	}
	async workspace(id: string, c: Queryable = this.db): Promise<Workspace> {
		const r = await c.query("SELECT payload,sealed FROM gulchdale.workspaces WHERE id=$1", [id]);
		if (!r.rowCount || !r.rows[0].sealed) throw new Error("Unknown/unsealed workspace " + id);
		const payload = r.rows[0].payload as Workspace;
		const snapshots = await c.query(
			"SELECT s.id,s.content FROM gulchdale.source_snapshots s JOIN gulchdale.workspace_sources w ON w.source_id=s.id WHERE w.workspace_id=$1",
			[id]
		);
		const w = {
			...payload,
			sources: payload.sources.map((s) => ({
				...s,
				bytes: snapshots.rows.find((r) => r.id === s.id)?.content as Buffer,
			})),
		};
		validateWorkspace(w);
		return w;
	}
	async catalog(id: string): Promise<CardRecord[]> {
		const r = await this.db.query("SELECT id,name,data FROM gulchdale.cards WHERE workspace_id=$1 ORDER BY id", [
			id,
		]);
		return r.rows;
	}
	async live(c: Queryable = this.db): Promise<string | null> {
		const r = await c.query("SELECT environment_hash FROM gulchdale.live_release WHERE singleton=true");
		return r.rows[0]?.environment_hash ?? null;
	}
	async release(hash: string, c: Queryable = this.db): Promise<Release> {
		const r = await c.query("SELECT hash,kind,payload FROM gulchdale.releases WHERE hash=$1", [hash]);
		if (!r.rowCount) throw new Error("Unknown release");
		const release = r.rows[0] as Release;
		if (digest({ kind: release.kind, payload: release.payload }) !== hash)
			throw new Error("Release integrity check failed");
		return release;
	}
	private async candidate(w: Workspace, c: Queryable) {
		const overrides = await c.query(
			'SELECT card_id AS "cardId",field,value FROM gulchdale.human_overrides ORDER BY card_id,field'
		);
		const releases = releasesFor(w, overrides.rows as HumanOverride[]);
		const from = await this.live(c),
			to = releases.at(-1)!.hash;
		const previous = from ? await this.release(from, c) : null;
		const previousRefs = previous?.payload.reference as ReleaseReference | undefined;
		const nextRefs = releases.at(-1)!.payload.reference as ReleaseReference;
		const oldPool = previousRefs
			? ((await this.release(previousRefs.pool, c)).payload.entries as Workspace["pool"])
			: [];
		const oldIds = new Set(oldPool.map((e) => e.cardId)),
			nextIds = new Set(w.pool.map((e) => e.cardId));
		const componentChanges: Data = {};
		if (previousRefs)
			for (const next of releases.filter((r) => r.kind !== "environment")) {
				const prior = await this.release(previousRefs[next.kind as keyof ReleaseReference], c);
				const changes = valueDiff(prior.payload, next.payload);
				if (changes !== null) componentChanges[next.kind] = changes;
			}
		const payload: Data = {
			workspace: w.id,
			from,
			to,
			previousReference: previousRefs ?? null,
			nextReference: nextRefs,
			added: [...nextIds].filter((id) => !oldIds.has(id)).sort(),
			removed: [...oldIds].filter((id) => !nextIds.has(id)).sort(),
			changedComponents: Object.keys(nextRefs).filter(
				(k) => previousRefs?.[k as keyof ReleaseReference] !== nextRefs[k as keyof ReleaseReference]
			),
			counts: w.counts,
			componentChanges,
			initialImport: !from,
		};
		return { releases, payload, digest: digest(payload) };
	}
	async diff(id: string) {
		return this.transaction(async (c) => {
			await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
			const w = await this.workspace(id, c),
				report = await this.candidate(w, c);
			await c.query(
				"INSERT INTO gulchdale.import_diffs(digest,workspace_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
				[report.digest, id, report.payload]
			);
			return { digest: report.digest, ...report.payload };
		});
	}
	async promote(id: string, reviewed: string): Promise<string> {
		return this.transaction(async (c) => {
			await c.query("SELECT pg_advisory_xact_lock(72401500)");
			await c.query("LOCK TABLE gulchdale.human_overrides IN SHARE MODE");
			const w = await this.workspace(id, c),
				report = await this.candidate(w, c);
			if (report.digest !== reviewed)
				throw new Error("Review digest is stale or incorrect; generate and review a new diff");
			const review = await c.query(
				"SELECT payload FROM gulchdale.import_diffs WHERE digest=$1 AND workspace_id=$2",
				[reviewed, id]
			);
			if (!review.rowCount || digest(review.rows[0].payload) !== reviewed)
				throw new Error("Diff must be generated and reviewed before promotion");
			for (const r of report.releases)
				await c.query(
					"INSERT INTO gulchdale.releases(hash,kind,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
					[r.hash, r.kind, r.payload]
				);
			const environment = report.releases.at(-1)!;
			const refs = environment.payload.reference as ReleaseReference;
			await c.query(
				"INSERT INTO gulchdale.environment_refs(hash,pool_hash,metadata_hash,rules_hash,engine_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
				[environment.hash, refs.pool, refs.metadata, refs.rules, refs.engine]
			);
			if ((await this.live(c)) !== environment.hash) {
				await c.query(
					"INSERT INTO gulchdale.live_release(singleton,environment_hash) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET environment_hash=EXCLUDED.environment_hash,updated_at=now()",
					[environment.hash]
				);
				await c.query("INSERT INTO gulchdale.promotions(environment_hash,reviewed_digest) VALUES($1,$2)", [
					environment.hash,
					reviewed,
				]);
			}
			return environment.hash;
		});
	}
	async compareLegacy(w: Workspace): Promise<Data> {
		const live = await this.live();
		if (!live)
			return {
				legacy: w.provenance.legacyVersion,
				live: null,
				reconciled: false,
				reason: "No promoted foundation release",
			};
		const release = await this.release(live);
		const expected = releasesFor(w, []).at(-1)!;
		const reference = release.payload.reference as ReleaseReference;
		const expectedReference = expected.payload.reference as ReleaseReference;
		const provenance = release.payload.provenance as Data;
		const matches = {
			pool: reference.pool === expectedReference.pool,
			rules: reference.rules === expectedReference.rules,
			engine: reference.engine === expectedReference.engine,
			sources:
				provenance.cubeId === w.provenance.cubeId &&
				provenance.environmentSha256 === w.provenance.environmentSha256 &&
				digest(provenance.sourceHashes) === digest(w.provenance.sourceHashes),
			counts: digest(release.payload.counts) === digest(w.counts),
		};
		return {
			legacy: w.provenance.legacyVersion,
			live,
			reconciled: Object.values(matches).every(Boolean),
			matches,
			// Deliberate human metadata overrides may differ without changing the legacy pool/rules.
			metadataMatchesImported: reference.metadata === expectedReference.metadata,
			counts: release.payload.counts,
			reference: release.payload.reference,
		};
	}
}
