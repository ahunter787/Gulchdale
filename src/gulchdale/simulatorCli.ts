import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { digest } from "./domain.js";
import { SIMULATOR_VERSION } from "./simulator.js";
import { FAMILIES, engineIdentity, runScenario, replayEvidence, type ScenarioEvidence } from "./simulationProof.js";

function main() {
	const [mode, ...args] = process.argv.slice(2);
	const options = new Map<string, string>();
	for (let i = 0; i < args.length; i += 2) {
		if (!args[i].startsWith("--") || !args[i + 1] || options.has(args[i]))
			throw new Error("Expected unique --option value pairs");
		options.set(args[i], args[i + 1]);
	}
	const allowed =
		mode === "simulate"
			? ["--runs", "--seats", "--seed-start", "--output"]
			: mode === "explain"
				? ["--seed", "--seats"]
				: mode === "replay"
					? ["--file"]
					: [];
	if (!allowed.length || [...options.keys()].some((key) => !allowed.includes(key)))
		throw new Error("Use simulate, explain or replay with documented options");
	const number = (key: string, fallback: number, minimum: number) => {
		const value = Number(options.get(key) ?? fallback);
		if (!Number.isSafeInteger(value) || value < minimum) throw new Error("Invalid " + key);
		return value;
	};
	const seats = options.get("--seats") ?? "both";
	if (mode !== "replay" && !["4", "8", "both"].includes(seats)) throw new Error("Seats must be 4, 8 or both");
	if (mode === "replay") {
		const file = options.get("--file");
		if (!file) throw new Error("Replay requires --file");
		const evidence = JSON.parse(fs.readFileSync(file, "utf8")) as ScenarioEvidence;
		if (evidence.input.engineHash !== engineIdentity())
			throw new Error("Evidence engine differs from executing compiled engine");
		console.log(
			JSON.stringify({
				status: "replayed",
				seats: evidence.seats,
				seed: evidence.seed,
				family: evidence.family,
				traceHash: replayEvidence(evidence),
			})
		);
		return;
	}
	if (mode === "explain") {
		if (seats === "both") throw new Error("Explain requires --seats 4 or 8");
		console.log(JSON.stringify(runScenario(Number(seats) as 4 | 8, number("--seed", 0, 0)), null, 2));
		return;
	}
	const runs = number("--runs", 5000, 1),
		start = number("--seed-start", 0, 0);
	if (runs > 50000 || !Number.isSafeInteger(start + runs)) throw new Error("Run count/seed range too large");
	const output = options.get("--output");
	if (!output) throw new Error("Simulate requires a dedicated --output directory");
	fs.mkdirSync(output, { recursive: true });
	if (fs.readdirSync(output).length) throw new Error("Output directory must be empty; reports are never overwritten");
	const write = (name: string, value: unknown) =>
		fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
	const seatCounts: (4 | 8)[] = seats === "both" ? [4, 8] : [Number(seats) as 4 | 8];
	const totals = { scenarios: 0, replayExecutions: 0, passed: 0, failed: 0 };
	const byFamily: Record<string, { passed: number; failed: number }> = Object.fromEntries(
		seatCounts.flatMap((n) => FAMILIES.map((f) => [n + ":" + f, { passed: 0, failed: 0 }]))
	);
	const firstPriority: Record<string, number> = {},
		outcomeSignatures = new Set<string>(),
		sampled = new Set<string>();
	const selectionBySeat: Record<string, { count: number; affinitySum: number }> = {},
		offersByPriority: Record<string, { offers: number; options: number }> = {};
	const hash = createHash("sha256"),
		releases: Record<string, unknown> = {};
	let aborted = false;
	for (const n of seatCounts) {
		for (let seed = start; seed < start + runs; seed++) {
			const key = n + ":" + FAMILIES[seed % FAMILIES.length];
			totals.scenarios++;
			try {
				const evidence = runScenario(n, seed, !sampled.has(key)); // includes independent command replay
				totals.replayExecutions++;
				totals.passed++;
				byFamily[key].passed++;
				hash.update(JSON.stringify([n, seed, evidence.traceHash]) + "\n");
				outcomeSignatures.add(
					digest({ seats: n, family: evidence.family, selected: evidence.metrics.selected })
				);
				for (const seat of evidence.metrics.firstPriority)
					firstPriority[n + ":" + seat] = (firstPriority[n + ":" + seat] ?? 0) + 1;
				if (["shared", "rotation"].includes(evidence.family)) {
					for (const [id, value] of Object.entries(evidence.metrics.selectedBySeat)) {
						const entry = (selectionBySeat[n + ":" + id] ??= { count: 0, affinitySum: 0 });
						entry.count += value.count;
						entry.affinitySum += value.affinitySum;
					}
					for (const [id, value] of Object.entries(evidence.metrics.offeredByPriority)) {
						const entry = (offersByPriority[n + ":" + id] ??= { offers: 0, options: 0 });
						entry.offers += value.offers;
						entry.options += value.options;
					}
				}
				if (!sampled.has(key)) {
					write("sample-" + n + "-" + evidence.family + ".json", evidence);
					releases[key] = evidence.audit?.release;
					sampled.add(key);
				}
			} catch (error) {
				totals.failed++;
				byFamily[key].failed++;
				write("failure-" + n + "-" + seed + ".json", {
					error: String(error),
					evidence: (error as { evidence?: unknown }).evidence ?? null,
				});
				if (totals.failed >= 20) {
					aborted = true;
					break;
				}
			}
			if (totals.scenarios % 100 === 0)
				process.stderr.write(
					"Phase 2 proof: " + totals.scenarios + " scenarios, " + totals.failed + " failures\n"
				);
		}
		if (aborted) break;
	}
	const report = {
		version: SIMULATOR_VERSION,
		engineHash: engineIdentity(),
		environment: { node: process.versions.node, platform: process.platform },
		seedRangePerSeat: { start, endExclusive: start + runs },
		seatCounts,
		runsPerSeat: runs,
		totals,
		byFamily,
		firstPriority,
		selectionBySeat,
		offersByPriority,
		distinctOutcomeSignatures: outcomeSignatures.size,
		corpusTraceHash: hash.digest("hex"),
		releases,
		aborted,
		synthetic: true,
		balanceApproved: false,
	};
	write("report.json", report);
	console.log(JSON.stringify(report, null, 2));
	if (totals.failed || aborted) process.exitCode = 1;
}
try {
	main();
} catch (error) {
	process.stderr.write(String(error) + "\n");
	process.exitCode = 1;
}
