import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { digest } from "../domain.js";
import { catalog, readAnnotations, readBundle, type Bundle } from "./catalog.js";
import { snapshot, SnapshotFailure } from "./snapshot.js";
import { report, compare, markdown, escapeMarkdown } from "./reports.js";
import {
	parseProfile,
	runExperiment,
	replay,
	researchEngineIdentity,
	researchEngineManifest,
	type Evidence,
	type Policy,
	type Metrics,
} from "./experiments.js";

interface ResultRow {
	seats: number;
	policy: Policy;
	seed: number;
	status: "passed" | "failed";
	traceHash?: string;
	metrics?: Metrics;
	error?: string;
}
function experimentMarkdown(
	results: ResultRow[],
	counts: { scenarios: number; passed: number; failed: number; replayExecutions: number },
	note: string
) {
	const lines = [
		"# Gulchdale research experiment",
		"",
		"Research only; balance is not approved.",
		"",
		`Distinct scenarios ${counts.scenarios}; passed ${counts.passed}; failed ${counts.failed}; replays ${counts.replayExecutions}.`,
		"",
		note,
		"",
		"Affinity is an annotation-based model diagnostic, not power or human preference. Grants are allocations but do not enter the selected-affinity denominator.",
		"",
		"| Seats | Policy | Pass / fail | Shortages | Held blocks | Smaller / replacements | Burns | Allocations | Mean selected affinity |",
		"| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
	];
	for (const seats of [...new Set(results.map((r) => r.seats))].sort())
		for (const policy of ["random-legal", "affinity-directed"] as Policy[]) {
			const rows = results.filter((r) => r.seats === seats && r.policy === policy),
				passed = rows.filter((r) => r.status === "passed");
			const sum = (key: keyof Metrics) => passed.reduce((n, r) => n + Number(r.metrics![key]), 0);
			const selected = sum("selectedCards"),
				average = selected ? (sum("affinitySum") / selected).toFixed(4) : "not measured";
			lines.push(
				`| ${seats} | ${policy} | ${passed.length} / ${rows.length - passed.length} | ${sum("shortages")} | ${sum("temporaryContention")} | ${sum("smallerOffers")} / ${sum("replacements")} | ${sum("burnedCopies")} | ${sum("allocations")} | ${average} |`
			);
		}
	lines.push(
		"",
		"## Failures",
		"",
		...results
			.filter((r) => r.status === "failed")
			.map((r) => `- Seats ${r.seats}, ${r.policy}, seed ${r.seed}: ${escapeMarkdown(r.error!)}`),
		"",
		"Full per-seat metrics, profile, hashes and seed results are in report.json. Representative traces and failure files remain alongside it. No conclusion about real deck legality or balanced content is implied.",
		""
	);
	return lines.join("\n");
}

function textFile(file: string) {
	const bytes = fs.readFileSync(file),
		text = bytes.toString("utf8");
	if (!Buffer.from(text).equals(bytes)) throw new Error("Inputs must be UTF-8");
	return text;
}
function outputDirectory(file: string) {
	const resolved = path.resolve(file),
		roots = [path.resolve(".gulchdale/research"), fs.realpathSync(os.tmpdir())];
	const inside = (root: string, p: string) => p.startsWith(root + path.sep);
	if (!roots.some((root) => inside(root, resolved)))
		throw new Error("Outputs must be under ignored .gulchdale/research/ or the OS temporary directory");
	let current = resolved;
	while (current !== path.dirname(current)) {
		if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
			throw new Error("Output path cannot contain symlinks");
		current = path.dirname(current);
	}
	fs.mkdirSync(resolved, { recursive: true });
	if (fs.readdirSync(resolved).length)
		throw new Error("Output directory must be empty; research files are never overwritten");
	return resolved;
}
function write(directory: string, name: string, value: unknown) {
	fs.writeFileSync(
		path.join(directory, name),
		typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
		{ flag: "wx", mode: 0o600 }
	);
}
async function main() {
	const [command, ...args] = process.argv.slice(2),
		options = new Map<string, string>();
	const boolean = ["--fetch", "--legacy-reference"];
	for (let i = 0; i < args.length; i++) {
		const key = args[i];
		if (!key.startsWith("--") || options.has(key)) throw new Error("Expected unique --option arguments");
		if (boolean.includes(key)) options.set(key, "true");
		else {
			const value = args[++i];
			if (!value || value.startsWith("--")) throw new Error("Missing option value");
			options.set(key, value);
		}
	}
	const allowed: Record<string, string[]> = {
		snapshot: ["--candidates", "--metadata", "--fetch", "--output"],
		validate: ["--bundle", "--annotations"],
		report: ["--bundle", "--annotations", "--legacy-reference", "--output"],
		compare: ["--before", "--after", "--before-annotations", "--after-annotations", "--output"],
		simulate: ["--bundle", "--annotations", "--profile", "--output"],
		replay: ["--file"],
	};
	if (!command || !Object.hasOwn(allowed, command) || [...options.keys()].some((k) => !allowed[command].includes(k)))
		throw new Error(
			"Commands: snapshot, validate, report, compare, simulate, replay; see docs/RESEARCH_WORKBENCH.md"
		);
	const required = (key: string) => {
		const value = options.get(key);
		if (!value) throw new Error("Required " + key);
		return value;
	};
	if (command === "snapshot") {
		const csv = textFile(required("--candidates"));
		const metadata = options.has("--metadata") ? textFile(required("--metadata")) : undefined;
		if (metadata !== undefined && options.has("--fetch")) throw new Error("Choose local metadata OR --fetch");
		const output = outputDirectory(required("--output"));
		let bundle: Bundle | undefined;
		try {
			bundle = await snapshot(csv, { metadata, fetch: options.has("--fetch") });
			const c = catalog(bundle, readAnnotations()); // refuse malformed responses before sealing output
			write(output, "bundle.json", bundle);
			console.log(
				JSON.stringify(
					{
						status: "research-snapshot",
						hash: bundle.hash,
						unresolved: c.cards.filter((c) => c.issues.length).length,
						output,
					},
					null,
					2
				)
			);
		} catch (error) {
			write(output, "failure.json", {
				error: String(error),
				candidateCsv: csv,
				sources: error instanceof SnapshotFailure ? error.sources : (bundle?.sources ?? []),
				sealed: false,
			});
			throw error;
		}
		return;
	}
	if (command === "replay") {
		const value = JSON.parse(textFile(required("--file"))) as Evidence | { evidence: Evidence };
		const evidence = "evidence" in value ? value.evidence : value;
		if (!evidence) throw new Error("Failure artifact has no replayable evidence");
		console.log(
			JSON.stringify({ status: evidence.failure ? "replayed-failure" : "replayed", traceHash: replay(evidence) })
		);
		return;
	}
	if (command === "compare") {
		const before = catalog(readBundle(required("--before")), readAnnotations(options.get("--before-annotations")));
		const after = catalog(readBundle(required("--after")), readAnnotations(options.get("--after-annotations")));
		const result = compare(before, after),
			output = outputDirectory(required("--output"));
		write(output, "report.json", result);
		write(output, "report.md", markdown(result));
		console.log(JSON.stringify({ reportHash: result.reportHash, output }));
		return;
	}
	const c = catalog(readBundle(required("--bundle")), readAnnotations(options.get("--annotations")));
	if (command === "validate") {
		console.log(
			JSON.stringify(
				{
					valid: true,
					bundleHash: c.bundleHash,
					annotationHash: c.annotationHash,
					cards: c.cards.length,
					resolutionIssueCount: c.cards.reduce((n, c) => n + c.issues.length, 0),
					note: "Structural validity is not content approval or experiment readiness.",
				},
				null,
				2
			)
		);
		return;
	}
	if (command === "report") {
		const result = report(c, options.has("--legacy-reference")),
			output = outputDirectory(required("--output"));
		write(output, "report.json", result);
		write(output, "report.md", markdown(result));
		console.log(JSON.stringify({ reportHash: result.reportHash, output }));
		return;
	}
	const p = parseProfile(textFile(required("--profile")), c),
		output = outputDirectory(required("--output"));
	const results: ResultRow[] = [],
		counts = { scenarios: 0, passed: 0, failed: 0, replayExecutions: 0 };
	let aborted = false;
	for (const [rosterIndex, roster] of p.rosters.entries()) {
		for (const policy of ["random-legal", "affinity-directed"] as Policy[]) {
			for (let seed = p.seedStart; seed < p.seedStart + p.runs; seed++) {
				counts.scenarios++;
				try {
					const e = runExperiment(c, p, rosterIndex, seed, policy, seed === p.seedStart);
					counts.passed++;
					counts.replayExecutions++;
					results.push({
						seats: roster.players.length,
						policy,
						seed,
						status: "passed",
						traceHash: e.traceHash,
						metrics: e.metrics,
					});
					if (seed === p.seedStart) write(output, `sample-${roster.players.length}-${policy}.json`, e);
				} catch (error) {
					counts.failed++;
					write(output, `failure-${roster.players.length}-${policy}-${seed}.json`, {
						error: String(error),
						evidence: (error as { evidence?: Evidence }).evidence ?? null,
					});
					results.push({
						seats: roster.players.length,
						policy,
						seed,
						status: "failed",
						error: String(error),
					});
					if (counts.failed >= 20) {
						aborted = true;
						break;
					}
				}
				if (counts.scenarios % 100 === 0)
					process.stderr.write(
						`Research experiments: ${counts.scenarios} scenarios, ${counts.failed} failures\n`
					);
			}
			if (aborted) break;
		}
		if (aborted) break;
	}
	const result = {
		version: "gulchdale-research-v1",
		researchOnly: true,
		balanceApproved: false,
		engineHash: researchEngineIdentity(),
		engineManifest: researchEngineManifest(),
		environment: { node: process.versions.node, platform: process.platform },
		catalogHash: digest(c),
		profileHash: digest(p),
		profile: p,
		seedRange: { start: p.seedStart, endExclusive: p.seedStart + p.runs },
		counts,
		aborted,
		results,
		corpusHash: digest(
			results.map((r) => ({
				seats: r.seats,
				policy: r.policy,
				seed: r.seed,
				traceHash: r.traceHash ?? null,
				status: r.status,
			}))
		),
		note: "Runs are per roster AND policy. Matched initial seeds do not guarantee identical later offers after choices diverge. Choices are models, not human/bot intelligence.",
	};
	write(output, "report.json", result);
	write(output, "report.md", experimentMarkdown(results, counts, result.note + " Aborted: " + aborted + "."));
	console.log(JSON.stringify({ ...counts, aborted, output, engineHash: result.engineHash }));
	if (counts.failed || aborted) process.exitCode = 1;
}
main().catch((error) => {
	console.error(String(error));
	console.error("Research command failed; no legacy content, database or live pointer was changed.");
	process.exitCode = 1;
});
