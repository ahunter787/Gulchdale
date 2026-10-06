import { describe, it } from "mocha";
import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { bytesHash, cardIdentity, digest } from "../src/gulchdale/domain.js";
import { loadCommittedWorkspace } from "../src/gulchdale/import.js";
import {
	candidates,
	catalog,
	parseAnnotations,
	readAnnotations,
	verifyBundle,
} from "../src/gulchdale/research/catalog.js";
import { snapshot, SnapshotFailure, type SnapshotIO } from "../src/gulchdale/research/snapshot.js";
import { report, compare, markdown } from "../src/gulchdale/research/reports.js";
import {
	parseProfile,
	runExperiment,
	replay,
	type Profile,
	type Evidence,
} from "../src/gulchdale/research/experiments.js";
import { definition } from "../src/gulchdale/simulationProof.js";

const io: SnapshotIO = {
	fetch: async () => {
		throw new Error("Tests must not use the network");
	},
	wait: async () => {},
	now: () => "2026-10-06T12:00:00.000Z",
};
const metadata = (name = "Research 0", i = 0) => ({
	name,
	id: "printing-" + i,
	oracle_id: "oracle-" + i,
	set: "tst",
	collector_number: String(i),
	cmc: i % 6,
	color_identity: i % 2 ? [] : ["W"],
	type_line: "Creature — Wizard",
	oracle_text: "Synthetic test only.",
	produced_mana: [],
});
const cardNames = Array.from({ length: 24 }, (_, i) => "Research " + i);
const candidateCsv =
	"name,Set,Collector Number,board,maybeboard\n" +
	cardNames.map((name, i) => `${name},tst,${i},${i === 0 ? "maybeboard" : "mainboard"},${i === 0}\n`).join("");
const localMetadata = JSON.stringify(cardNames.map((name, i) => metadata(name, i)));
const annotationText = JSON.stringify({
	schemaVersion: 1,
	archetypes: ["study"],
	targets: { fixing: null, removal: 2 },
	cards: cardNames.map((name, i) => ({
		name,
		category: "main-pool",
		roles: i % 2 ? [] : ["removal"],
		tribes: [],
		archetypes: ["study"],
		affinities: { study: i % 3 === 0 ? 0.5 : i % 3 === 1 ? 0.2 : 0.9 },
		evidence: "Synthetic fixture, not approved content",
	})),
});
async function fixture() {
	const bundle = await snapshot(candidateCsv, { metadata: localMetadata }, io);
	return { bundle, c: catalog(bundle, parseAnnotations(annotationText)) };
}
function profileText(runs = 2) {
	return JSON.stringify({
		schemaVersion: 1,
		name: "synthetic-proof-only",
		cards: cardNames,
		seedStart: 0,
		runs,
		settings: { guidance: 0.8, baseWeight: 1 },
		rosters: [4, 8].map((seats) => ({
			players: Array.from({ length: seats }, (_, i) => ({
				id: "p" + i,
				kind: i < 5 ? "human" : "bot",
				boosters: 4,
			})),
			actions: [
				{
					type: "stage",
					requestId: "stage-start",
					stage: 0,
					definition: definition({
						kind: "shared",
						categories: ["main-pool"],
						fallbackCategories: ["main-pool"],
						options: 2,
						allowedColors: ["W"],
						signals: { study: 1 },
					}),
				},
				{ type: "recover", requestId: "restore-pending" },
				...Array.from({ length: seats }, (_, i) => ({
					type: "select",
					requestId: "pick-" + i,
					opportunityId: "stage:0:p" + i,
					playerId: "p" + i,
				})),
			],
		})),
	});
}
describe("Gulchdale research workbench", function () {
	this.timeout(30000);
	it("preserves main/maybeboards, optional printing IDs and exact UTF-8 snapshot sources", async () => {
		const { bundle } = await fixture();
		expect(candidates(candidateCsv)[0]).to.include({ board: "maybeboard", maybeboard: true });
		expect(candidates("name,board\nExample,sideboard\n")[0]).to.include({
			set: null,
			collectorNumber: null,
			board: "sideboard",
		});
		expect(bundle.candidateCsv).to.equal(candidateCsv);
		expect(bundle.candidateHash).to.equal(bytesHash(Buffer.from(candidateCsv)));
		expect(bundle.sources[0].body).to.equal(localMetadata);
		expect(bundle.sources[0].hash).to.equal(bytesHash(Buffer.from(localMetadata)));
	});
	it("rejects missing/duplicate CSV headers, unnamed rows and invalid board flags", () => {
		for (const csv of ["wrong\nCard\n", "name,Name\nA,A\n", "name\n\n", "name,maybeboard\nCard,perhaps\n"])
			expect(() => candidates(csv)).to.throw();
	});
	it("seals snapshots and detects tampered source bytes, manifest and timestamps", async () => {
		const { bundle } = await fixture();
		expect(verifyBundle(JSON.parse(JSON.stringify(bundle)))).to.deep.equal(bundle);
		for (const change of [
			(b: typeof bundle) => (b.sources[0].body += " "),
			(b: typeof bundle) => (b.candidateCsv += " "),
			(b: typeof bundle) => (b.capturedAt = "bad-date"),
		]) {
			const damaged = structuredClone(bundle);
			change(damaged);
			expect(() => verifyBundle(damaged)).to.throw();
		}
	});
	it("folds multiple printings into one canonical card without multiplying supply", async () => {
		const csv = "name,Set,Collector Number\nCard,tst,0\nCard,alt,1\n";
		const body = JSON.stringify([
			metadata("Card", 0),
			{ ...metadata("Card", 0), id: "other-print", set: "alt", collector_number: "1" },
		]);
		const bundle = await snapshot(csv, { metadata: body }, io);
		const c = catalog(
			bundle,
			parseAnnotations(
				JSON.stringify({ schemaVersion: 1, archetypes: [], cards: [{ name: "Card", category: "main-pool" }] })
			)
		);
		expect(c.cards).to.have.length(1);
		expect(c.cards[0].metadata!.printingIds).to.have.length(2);
		expect(c.cards[0].issues).to.deep.equal([]);
		expect(report(c).supply[0].perSessionCopies).to.deep.equal({ four: 1, eight: 1 });
	});
	it("does not choose ambiguous printings, fuzzy names or incomplete printing requests", async () => {
		const body = JSON.stringify([
			metadata("Card", 0),
			{ ...metadata("Card", 0), id: "other-print", set: "alt", collector_number: "1" },
		]);
		for (const csv of ["name\nCard\n", "name\nCard typo\n", "name,Set\nCard,tst\n"]) {
			const c = catalog(await snapshot(csv, { metadata: body }, io), readAnnotations());
			expect(c.cards[0].issues.length).to.be.greaterThan(0);
			expect(c.cards[0].metadata).to.equal(null);
		}
	});
	it("exposes contradictory metadata across printings", async () => {
		const bundle = await snapshot(
			"name,Set,Collector Number\nCard,tst,0\nCard,alt,1\n",
			{
				metadata: JSON.stringify([
					metadata("Card", 0),
					{ ...metadata("Card", 0), set: "alt", collector_number: "1", color_identity: ["U"] },
				]),
			},
			io
		);
		expect(catalog(bundle, readAnnotations()).cards[0].issues.join(" ")).to.include("conflicting");
	});
	it("keeps curator roles and human affinities separate from imported/legacy-like fields", async () => {
		const bundle = await snapshot(
			"name,tags\nCard,goblin;mono\n",
			{ metadata: JSON.stringify([{ ...metadata("Card"), roles: ["ramp"], affinities: { study: 1 } }]) },
			io
		);
		const a = parseAnnotations(
			JSON.stringify({
				schemaVersion: 1,
				archetypes: ["study"],
				cards: [
					{
						name: "Card",
						category: "tribal",
						roles: ["removal"],
						tribes: ["chosen"],
						archetypes: ["study"],
						affinities: { study: 0.2 },
					},
				],
			})
		);
		const c = catalog(bundle, a);
		expect(c.cards[0].annotation!.affinities!.study).to.equal(0.2);
		expect(report(c).roles.counts).to.deep.equal({ removal: 1 });
		expect(catalog(bundle, readAnnotations()).cards[0].annotation).to.equal(null);
	});
	it("rejects conflicting annotation IDs, unsupported categories, bad affinities and unknown candidates", async () => {
		const { bundle } = await fixture();
		const base = JSON.parse(annotationText);
		for (const modify of [
			(a: typeof base) => a.cards.push(a.cards[0]),
			(a: typeof base) => (a.cards[0].category = "invented"),
			(a: typeof base) => (a.cards[0].affinities.study = 2),
			(a: typeof base) => (a.cards[0].cardId = cardIdentity("Other")),
		]) {
			const a = structuredClone(base);
			modify(a);
			expect(() => parseAnnotations(JSON.stringify(a))).to.throw();
		}
		const a = structuredClone(base);
		a.cards[0].name = "Not in candidates";
		expect(() => catalog(bundle, parseAnnotations(JSON.stringify(a)))).to.throw("unknown candidate");
	});
	it("reports denominators, unknowns and unset targets rather than implied zeros", async () => {
		const c = catalog(await snapshot("name\nMissing\n", {}, io), readAnnotations()),
			r = report(c);
		expect(r.colorIdentity).to.include({ total: 1, known: 0, unknown: 1 });
		expect(r.roles.unknown).to.equal(1);
		expect(r.targets.fixing.target).to.equal("not specified");
		expect(r.supply[0].perSessionCopies).to.equal(null);
		expect(markdown(r)).to.include("known 0; unknown 1");
	});
	it("distinguishes known colorless/nonproducer observations from missing fields", async () => {
		const { c } = await fixture();
		const r = report(c);
		expect(r.colorIdentity.known).to.equal(24);
		expect(r.colorIdentity.counts.colorless).to.equal(12);
		expect(r.manaProduction).to.include({ total: 24, known: 24, unknown: 0 });
		expect(r.manaProduction.counts).to.deep.equal({});
	});
	it("provides deterministic reports and separate metadata/annotation diffs", async () => {
		const { c, bundle } = await fixture();
		expect(markdown(report(c))).to.equal(markdown(report(c)));
		const a = JSON.parse(annotationText);
		a.cards[0].reviewNotes = "Research hypothesis";
		const changed = catalog(bundle, parseAnnotations(JSON.stringify(a))),
			diff = compare(c, changed);
		expect(diff.metadata).to.equal(null);
		expect(diff.annotations).not.to.equal(null);
		expect(markdown(diff)).to.include("Research only");
		const removed = await snapshot(
			"name,Set,Collector Number\nResearch 0,tst,0\n",
			{ metadata: localMetadata },
			io
		);
		expect(compare(c, catalog(removed, readAnnotations())).metadata).not.to.equal(null);
	});
	it("requires explicit legacy comparison and never imports its annotations or pack rules", async () => {
		const name = loadCommittedWorkspace().cards[0].name;
		const c = catalog(await snapshot("name\n" + JSON.stringify(name) + "\n", {}, io), readAnnotations());
		expect(report(c).legacyReference).to.equal(null);
		expect(report(c, true).legacyReference!.overlapping).to.include(cardIdentity(name));
		expect(c.cards[0].annotation).to.equal(null);
		expect(c.archetypes).to.deep.equal([]);
	});
	it("uses approved unique, scaled tribal and personal staple capacities", async () => {
		const { bundle } = await fixture(),
			a = JSON.parse(annotationText);
		a.cards[0].category = "tribal";
		a.cards[1].category = "commander-staple";
		const r = report(catalog(bundle, parseAnnotations(JSON.stringify(a))));
		expect(r.supply.find((s) => s.cardId === cardIdentity("Research 0"))!.perSessionCopies).to.deep.equal({
			four: 2,
			eight: 3,
		});
		expect(r.supply.find((s) => s.cardId === cardIdentity("Research 1"))!).to.include({ personal: true });
	});
	it("fetches only listed identities in batches of 75 with at least 600ms pacing and headers", async () => {
		const requests: RequestInit[] = [],
			waits: number[] = [];
		const mock: SnapshotIO = {
			...io,
			wait: async (ms) => {
				waits.push(ms);
			},
			fetch: async (url, options) => {
				expect(url).to.equal("https://api.scryfall.com/cards/collection");
				requests.push(options);
				const ids = JSON.parse(options.body as string).identifiers;
				return new Response(
					JSON.stringify({ data: ids.map((v: { name: string }, i: number) => metadata(v.name, i)) })
				);
			},
		};
		await snapshot(
			"name\n" + Array.from({ length: 155 }, (_, i) => "Candidate " + i + "\n").join(""),
			{ fetch: true },
			mock
		);
		expect(requests.map((r) => JSON.parse(r.body as string).identifiers.length)).to.deep.equal([75, 75, 5]);
		expect(waits).to.deep.equal([600, 600]);
		expect(requests[0].headers).to.include({ Accept: "application/json", "Content-Type": "application/json" });
		expect((requests[0].headers as Record<string, string>)["User-Agent"]).to.include("Gulchdale");
	});
	it("deduplicates fetches and records Scryfall not-found evidence", async () => {
		let count = 0;
		const mock: SnapshotIO = {
			...io,
			fetch: async (_u, options) => {
				count++;
				expect(JSON.parse(options.body as string).identifiers).to.have.length(1);
				return new Response(JSON.stringify({ data: [], not_found: [{ name: "Absent" }] }));
			},
		};
		const b = await snapshot("name\nAbsent\nAbsent\n", { fetch: true }, mock);
		expect(count).to.equal(1);
		expect(b.errors[0]).to.include("Absent");
		expect(catalog(b, readAnnotations()).cards).to.have.length(1);
	});
	it("uses the documented printing and oracle identifier schemas without trusting response order", async () => {
		const mock: SnapshotIO = {
			...io,
			fetch: async (_url, options) => {
				expect(JSON.parse(options.body as string).identifiers).to.deep.equal([
					{ set: "tst", collector_number: "0" },
					{ oracle_id: "oracle-1" },
				]);
				return new Response(JSON.stringify({ data: [metadata("Other", 1), metadata("Card", 0)] }));
			},
		};
		const b = await snapshot(
			"name,Set,Collector Number,oracle_id\nCard,tst,0,\nOther,,,oracle-1\n",
			{ fetch: true },
			mock
		);
		expect(catalog(b, readAnnotations()).cards.every((c) => !c.issues.length)).to.equal(true);
	});
	it("respects Retry-After, retains unsuccessful raw responses and bounds retries", async () => {
		let calls = 0;
		const waits: number[] = [];
		const mock: SnapshotIO = {
			...io,
			wait: async (ms) => {
				waits.push(ms);
			},
			fetch: async () =>
				++calls === 1
					? new Response("busy", { status: 429, headers: { "Retry-After": "1" } })
					: new Response(JSON.stringify({ data: [metadata()] })),
		};
		const b = await snapshot("name\nResearch 0\n", { fetch: true }, mock);
		expect(waits).to.deep.equal([1000, 600]);
		expect(b.sources.map((s) => s.status)).to.deep.equal([429, 200]);
		calls = 0;
		mock.fetch = async () => {
			calls++;
			return new Response("unavailable", { status: 503 });
		};
		try {
			await snapshot("name\nResearch 0\n", { fetch: true }, mock);
			throw new Error("Expected failure");
		} catch (error) {
			expect(error).to.be.instanceOf(SnapshotFailure);
			expect(calls).to.equal(3);
		}
	});
	it("fails closed on malformed, denied, interrupted or excessive-delay requests without changing an earlier snapshot", async () => {
		const { bundle } = await fixture(),
			before = digest(bundle);
		for (const response of [
			new Response("no", { status: 403 }),
			new Response("not-json"),
			new Response("{}"),
			new Response("null"),
			new Response("[]"),
			new Response("busy", { status: 429, headers: { "Retry-After": "3600" } }),
		]) {
			let rejected = false;
			try {
				await snapshot("name\nResearch 0\n", { fetch: true }, { ...io, fetch: async () => response });
			} catch {
				rejected = true;
			}
			expect(rejected).to.equal(true);
		}
		try {
			await snapshot("name\nResearch 0\n", { fetch: true }, io);
		} catch (error) {
			expect(error).to.be.instanceOf(SnapshotFailure);
		}
		expect(digest(bundle)).to.equal(before);
	});
	it("refuses implicit fetch combined with local metadata", async () => {
		let rejected = false;
		try {
			await snapshot("name\nCard\n", { metadata: "[]", fetch: true }, io);
		} catch {
			rejected = true;
		}
		expect(rejected).to.equal(true);
	});
	it("retains earlier raw responses when reading a later body is interrupted", async () => {
		let calls = 0;
		const mock: SnapshotIO = {
			...io,
			fetch: async () => {
				if (!calls++) return new Response("busy", { status: 429 });
				const interrupted = new Response("unread");
				interrupted.text = async () => {
					throw new Error("Interrupted body");
				};
				return interrupted;
			},
		};
		try {
			await snapshot("name\nResearch 0\n", { fetch: true }, mock);
			throw new Error("Expected failure");
		} catch (error) {
			expect(error).to.be.instanceOf(SnapshotFailure);
			expect((error as SnapshotFailure).sources[0].body).to.equal("busy");
		}
	});
	it("requires explicit complete profiles, subsets, rosters, resources, masks and classifications", async () => {
		const { c, bundle } = await fixture();
		for (const modify of [
			(p: Profile) => p.rosters[0].players.pop(),
			(p: Profile) => (p.settings.guidance = 2),
			(p: Profile) => (p.cards = ["Absent"]),
			(p: Profile) => (p.rosters[0].actions = []),
			(p: Profile) => (p.runs = 0),
		]) {
			const p = JSON.parse(profileText());
			modify(p);
			expect(() => parseProfile(JSON.stringify(p), c)).to.throw();
		}
		expect(() => parseProfile(profileText(), catalog(bundle, readAnnotations()))).to.throw();
	});
	for (const index of [0, 1])
		for (const policy of ["random-legal", "affinity-directed"] as const)
			it(`replays ${policy} at ${index ? 8 : 4} seats with pending-offer recovery`, async () => {
				const { c } = await fixture(),
					p = parseProfile(profileText(), c),
					e = runExperiment(c, p, index, 0, policy);
				expect(replay(JSON.parse(JSON.stringify(e)))).to.equal(e.traceHash);
				expect(e.metrics.allocations).to.equal(index ? 8 : 4);
				expect(e.steps.some((s) => "recover" in s)).to.equal(true);
				expect(e.metrics.shortages).to.equal(0);
				expect(e.release.engine).to.equal(e.engineHash);
				expect(e.engineManifest.dependencies.map((d) => d.name)).to.deep.equal([
					"yaml",
					"csv-parse",
					"random-js",
				]);
				expect(JSON.stringify(e.audit)).to.include('"candidates"');
			});
	it("matches initial generation across policies and keeps selection randomness separate", async () => {
		const { c } = await fixture(),
			p = parseProfile(profileText(), c);
		const a = runExperiment(c, p, 0, 0, "random-legal"),
			b = runExperiment(c, p, 0, 0, "affinity-directed");
		expect(a.input).to.deep.equal(b.input);
		expect(a.steps[0]).to.deep.equal(b.steps[0]);
		expect(b.metrics.affinitySum).to.be.at.least(a.metrics.affinitySum);
	});
	it("keeps a seed reproducible when narrowing the run window", async () => {
		const { c } = await fixture(),
			p = parseProfile(profileText(), c),
			smaller = structuredClone(p);
		smaller.runs = 1;
		smaller.seedStart = 1;
		expect(runExperiment(c, p, 0, 1, "random-legal").traceHash).to.equal(
			runExperiment(c, smaller, 0, 1, "random-legal").traceHash
		);
	});
	it("preserves neutral scores and applies human overrides in the research adapter", async () => {
		const { c } = await fixture(),
			raw = JSON.parse(profileText());
		raw.rosters[0].actions = [
			{
				type: "create",
				requestId: "scores",
				opportunityId: "scores",
				playerId: "p0",
				definition: definition({
					categories: ["main-pool"],
					fallbackCategories: [],
					allowedColors: ["W"],
					signals: { study: 1 },
				}),
			},
		];
		const p = parseProfile(JSON.stringify(raw), c),
			e = runExperiment(c, p, 0, 0, "random-legal");
		const restored = (await import("../src/gulchdale/simulator.js")).PackSimulator.restore(e.snapshot);
		const offer = restored.offer("scores")!;
		const candidates = offer.trace.attempts[0].candidates;
		const neutral = candidates.find((c) => c.cardId === cardIdentity("Research 0"))!;
		expect(neutral.weight).to.equal(1);
		const override = candidates.find((c) => c.cardId === cardIdentity("Research 1"))!;
		expect(override.contributions[0]).to.include({ affinity: 0.2, humanOverride: true });
		expect(override.weight).to.be.closeTo(Math.exp(0.8 * -0.6), 1e-12);
	});
	it("never retries an unfulfillable offer or spends its booster implicitly", async () => {
		const { c } = await fixture();
		const raw = JSON.parse(profileText());
		raw.rosters[0].actions = [
			{
				type: "create",
				requestId: "fail-offer",
				opportunityId: "missing-tribe",
				playerId: "p0",
				definition: definition({
					kind: "tribal",
					tribe: "missing",
					categories: ["tribal"],
					fallbackCategories: [],
					allowedColors: ["W"],
					signals: {},
					boosterCost: 1,
				}),
			},
		];
		const e = runExperiment(c, parseProfile(JSON.stringify(raw), c), 0, 0, "random-legal");
		expect(e.metrics.shortages).to.equal(1);
		expect(e.metrics.boosterBalances.p0).to.equal(4);
		expect(e.steps).to.have.length(1);
	});
	it("rejects tampered replay and captures replayable failed actions", async () => {
		const { c } = await fixture(),
			p = parseProfile(profileText(), c),
			e = runExperiment(c, p, 0, 0, "random-legal");
		const tampered = structuredClone(e);
		tampered.steps[0] = { recover: true, stateHash: "wrong" };
		expect(() => replay(tampered)).to.throw();
		const damagedMetrics = structuredClone(e);
		damagedMetrics.metrics.allocations++;
		expect(() => replay(damagedMetrics)).to.throw("seal mismatch");
		const damagedSnapshot = structuredClone(e);
		damagedSnapshot.snapshot.input.seed = "wrong";
		const { seal: _seal, ...payload } = damagedSnapshot;
		damagedSnapshot.seal = digest(payload);
		expect(() => replay(damagedSnapshot)).to.throw("final replay mismatch");
		const bad = structuredClone(p);
		bad.rosters[0].actions.push({
			type: "select",
			requestId: "stale-new-request",
			playerId: "p0",
			opportunityId: "stage:0:p0",
		});
		try {
			runExperiment(c, bad, 0, 0, "random-legal");
			throw new Error("Expected rejection");
		} catch (error) {
			const failure = (error as { evidence: Evidence }).evidence;
			expect(failure.failure).not.to.equal(undefined);
			expect(replay(failure)).to.equal(failure.traceHash);
		}
	});
	it("runs the real CLI offline, writes readable artifacts, refuses overwrite and replays samples", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "gulchdale-research-test-"));
		fs.writeFileSync(path.join(root, "cards.csv"), candidateCsv);
		fs.writeFileSync(path.join(root, "metadata.json"), localMetadata);
		fs.writeFileSync(path.join(root, "annotations.yaml"), annotationText);
		fs.writeFileSync(path.join(root, "profile.yaml"), profileText(1));
		const cli = (...args: string[]) =>
			spawnSync(process.execPath, ["dist/src/gulchdale/research/cli.js", ...args], { encoding: "utf8" });
		const snap = path.join(root, "snapshot");
		expect(
			cli(
				"snapshot",
				"--candidates",
				path.join(root, "cards.csv"),
				"--metadata",
				path.join(root, "metadata.json"),
				"--output",
				snap
			).status
		).to.equal(0);
		const args = ["--bundle", path.join(snap, "bundle.json"), "--annotations", path.join(root, "annotations.yaml")];
		expect(cli("validate", ...args).status).to.equal(0);
		expect(cli("report", ...args, "--output", path.join(root, "report")).status).to.equal(0);
		expect(fs.readFileSync(path.join(root, "report/report.md"), "utf8")).to.include("known 24");
		expect(cli("report", ...args, "--output", path.join(root, "report")).status).not.to.equal(0);
		expect(
			cli(
				"simulate",
				...args,
				"--profile",
				path.join(root, "profile.yaml"),
				"--output",
				path.join(root, "experiments")
			).status
		).to.equal(0);
		const results = JSON.parse(fs.readFileSync(path.join(root, "experiments/report.json"), "utf8"));
		expect(results.counts).to.deep.equal({ scenarios: 4, passed: 4, failed: 0, replayExecutions: 4 });
		expect(cli("replay", "--file", path.join(root, "experiments/sample-8-affinity-directed.json")).status).to.equal(
			0
		);
		expect(cli("report", ...args, "--fetch", "--output", path.join(root, "invalid")).status).not.to.equal(0);
	});
	it("ties directed choices by canonical ID and does not double-count idempotent allocation", async () => {
		const { c } = await fixture(),
			raw = JSON.parse(profileText());
		for (const card of c.cards) card.annotation!.affinities = { study: 0.5 };
		raw.rosters[0].actions = [
			{
				type: "create",
				requestId: "tie",
				opportunityId: "tie",
				playerId: "p0",
				definition: definition({
					categories: ["main-pool"],
					fallbackCategories: [],
					allowedColors: ["W"],
					signals: { study: 1 },
				}),
			},
			{ type: "select", requestId: "tie-pick", opportunityId: "tie", playerId: "p0" },
			{ type: "select", requestId: "tie-pick", opportunityId: "tie", playerId: "p0" },
		];
		const e = runExperiment(c, parseProfile(JSON.stringify(raw), c), 0, 0, "affinity-directed");
		const s = (await import("../src/gulchdale/simulator.js")).PackSimulator.restore(e.snapshot),
			offer = s.offer("tie")!;
		expect(offer.selected).to.deep.equal([...offer.cards].sort().slice(0, 1));
		expect(e.metrics.allocations).to.equal(1);
	});
	it("models explicit decline and remainder burns without hidden charges", async () => {
		const { c } = await fixture(),
			raw = JSON.parse(profileText());
		const def = definition({
			categories: ["main-pool"],
			fallbackCategories: [],
			allowedColors: ["W"],
			signals: { study: 1 },
			boosterCost: 1,
		});
		raw.rosters[0].actions = [
			{ type: "create", requestId: "a", opportunityId: "a", playerId: "p0", definition: def },
			{ type: "decline", requestId: "a-decline", opportunityId: "a", playerId: "p0" },
			{
				type: "create",
				requestId: "b",
				opportunityId: "b",
				playerId: "p0",
				definition: { ...def, remainder: "burn" },
			},
			{ type: "select", requestId: "b-pick", opportunityId: "b", playerId: "p0" },
		];
		const e = runExperiment(c, parseProfile(JSON.stringify(raw), c), 0, 0, "random-legal");
		expect(e.metrics.declines).to.equal(1);
		expect(e.metrics.burnedCopies).to.equal(3);
		expect(e.metrics.boosterBalances.p0).to.equal(3);
	});
	it("uses the existing engine for separate personal staple grants", async () => {
		const { c } = await fixture(),
			raw = JSON.parse(profileText());
		c.cards.find((c) => c.name === "Research 0")!.annotation!.category = "commander-staple";
		raw.rosters[0].actions = [
			{ type: "grant", requestId: "grant-0", cardId: "Research 0", playerId: "p0" },
			{ type: "grant", requestId: "grant-1", cardId: "Research 0", playerId: "p1" },
			{ type: "grant", requestId: "grant-duplicate", cardId: "Research 0", playerId: "p0" },
		];
		const e = runExperiment(c, parseProfile(JSON.stringify(raw), c), 0, 0, "random-legal");
		expect(e.metrics.allocations).to.equal(2);
		expect(e.metrics.poolCounts.p0).to.equal(1);
		expect(e.metrics.poolCounts.p1).to.equal(1);
	});
	it("keeps malformed masks and shared-priority bypass out of profiles", async () => {
		const { c } = await fixture();
		for (const modify of [
			(p: any) => delete p.rosters[0].actions[0].definition.allowedColors,
			(p: any) => (p.rosters[0].actions[0].definition.allowedColors = ["X"]),
			(p: any) =>
				(p.rosters[0].actions[0] = {
					type: "create",
					requestId: "bypass",
					opportunityId: "bypass",
					playerId: "p0",
					definition: p.rosters[0].actions[0].definition,
				}),
		]) {
			const p = JSON.parse(profileText());
			modify(p);
			expect(() => parseProfile(JSON.stringify(p), c)).to.throw();
		}
	});
	it("replays failures that occur before any engine command is issued", async () => {
		const { c } = await fixture(),
			p = parseProfile(profileText(), c);
		p.rosters[0].actions = [{ type: "select", requestId: "absent", opportunityId: "not-offered", playerId: "p0" }];
		try {
			runExperiment(c, p, 0, 0, "random-legal");
			throw new Error("Expected rejection");
		} catch (error) {
			const e = (error as { evidence: Evidence }).evidence;
			expect(e.failure!.command).to.equal(null);
			expect(replay(e)).to.equal(e.traceHash);
		}
	});
	it("retains observed multi-face Oracle text without guessing rules", async () => {
		const m: Record<string, unknown> = metadata("Study Faces");
		delete m.oracle_text;
		m.card_faces = [
			{ name: "Face A", oracle_text: "Observed A" },
			{ name: "Face B", oracle_text: "Observed B" },
		];
		const c = catalog(
			await snapshot("name\nStudy Faces\n", { metadata: JSON.stringify([m]) }, io),
			readAnnotations()
		);
		expect(c.cards[0].metadata!.oracleText).to.equal("Face A: Observed A\nFace B: Observed B");
	});
	it("escapes external Markdown/HTML and safely counts hostile-looking metadata keys", async () => {
		const m = { ...metadata("<script>Card</script>"), type_line: "__proto__" };
		const c = catalog(
				await snapshot("name\n<script>Card</script>\n", { metadata: JSON.stringify([m]) }, io),
				readAnnotations()
			),
			r = report(c);
		expect(Object.hasOwn(r.cardTypes.counts, "__proto__")).to.equal(true);
		expect(r.cardTypes.counts["__proto__"]).to.equal(1);
		expect(markdown(r)).not.to.include("<script>");
	});
});
