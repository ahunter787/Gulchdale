import fs from "node:fs";
import { digest } from "./domain.js";
import {
	PackSimulator,
	SIMULATOR_VERSION,
	type SimulatorInput,
	type SimulatorCommand,
	type CommandResult,
	type PackDefinition,
	type Offer,
	type CreateResult,
} from "./simulator.js";

export const FAMILIES = [
	"shared",
	"partial-tribal",
	"replacement",
	"unfulfillable",
	"contention",
	"decline",
	"remainder-burn",
	"rotation",
] as const;
let cachedEngine: string | null = null;
export function engineIdentity(): string {
	return (cachedEngine ??= digest({
		version: SIMULATOR_VERSION,
		randomEngine: "random-js/MersenneTwister19937",
		dependencyVersion: JSON.parse(fs.readFileSync("node_modules/random-js/package.json", "utf8")).version,
		sources: ["simulator.js", "simulationProof.js", "domain.js", "supply.js"].map((path) => ({
			path,
			hash: digest(fs.readFileSync(new URL(path, import.meta.url), "utf8")),
		})),
	}));
}
export function fixture(seats: 4 | 8, seed: number): SimulatorInput {
	const archetypes = Array.from({ length: 6 }, (_, i) => "archetype-" + i);
	const card = (
		id: string,
		category: SimulatorInput["cards"][number]["category"],
		i: number
	): SimulatorInput["cards"][number] => ({
		cardId: id,
		category,
		colors:
			category === "utility-land" || category === "commander-staple" ? [] : [["W", "U", "B", "R", "G"][i % 5]],
		tribes: category === "tribal" ? ["tribe-" + (i % 4), ...(i < 2 ? ["tiny"] : [])] : [],
		archetypes:
			category === "commander" || category === "commander-staple"
				? []
				: [archetypes[i % 6], archetypes[(i + 1) % 6]],
		affinities: { [archetypes[i % 6]]: 0.9, [archetypes[(i + 1) % 6]]: 0.7 },
		...(i === 0 ? { humanAffinities: { [archetypes[0]]: 0.2 } } : {}),
	});
	return {
		seed: "proof-" + seed,
		engineHash: engineIdentity(),
		archetypes,
		settings: { guidance: Math.floor(seed / FAMILIES.length) % 2 ? 0.8 : 0, baseWeight: 1 },
		players: Array.from({ length: seats }, (_, i) => ({
			id: "seat-" + i,
			kind: i < (seats === 8 ? 5 : 4) ? "human" : "bot",
			boosters: 4,
		})),
		cards: [
			...Array.from({ length: 20 }, (_, i) => card("commander-" + i, "commander", i)),
			...Array.from({ length: 24 }, (_, i) => card("tribal-" + i, "tribal", i)),
			...Array.from({ length: 68 }, (_, i) => card("main-" + i, "main-pool", i)),
			...Array.from({ length: 8 }, (_, i) => card("utility-" + i, "utility-land", i)),
			card("staple-0", "commander-staple", 0),
			card("staple-1", "commander-staple", 1),
		],
	};
}
export function definition(changes: Partial<PackDefinition> = {}): PackDefinition {
	return {
		kind: "private",
		options: 3,
		keep: 1,
		categories: ["main-pool", "utility-land"],
		fallbackCategories: ["main-pool", "utility-land"],
		allowedColors: ["W", "U", "B", "R", "G"],
		signals: { "archetype-0": 1, "archetype-1": 0.5 },
		tribe: null,
		remainder: "release",
		boosterCost: 0,
		...changes,
	};
}
export interface Attempt {
	command: SimulatorCommand;
	expectedError: boolean;
	resultHash: string | null;
}
export interface ScenarioEvidence {
	seats: 4 | 8;
	seed: number;
	family: string;
	input: SimulatorInput;
	attempts: Attempt[];
	snapshot: ReturnType<PackSimulator["snapshot"]>;
	traceHash: string;
	audit?: ReturnType<PackSimulator["audit"]>;
	metrics: {
		firstPriority: string[];
		selected: string[];
		replacements: number;
		smaller: number;
		declines: number;
		blocked: number;
		unfulfillable: number;
		selectedBySeat: Record<string, { count: number; affinitySum: number }>;
		offeredByPriority: Record<string, { offers: number; options: number }>;
	};
}
function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
export function replayEvidence(evidence: ScenarioEvidence): string {
	const s = new PackSimulator(evidence.input);
	for (const attempt of evidence.attempts) {
		const before = attempt.expectedError ? s.snapshot().stateHash : null;
		let result: CommandResult | undefined, failure: unknown;
		try {
			result = s.execute(attempt.command);
		} catch (error) {
			failure = error;
		}
		if (attempt.expectedError) {
			check(failure, "Expected rejection during replay");
			check(before === s.snapshot().stateHash, "Rejected replay mutated state");
		} else {
			if (failure) throw failure;
			check(digest(result) === attempt.resultHash, "Command result replay mismatch");
		}
		s.assertInvariants();
	}
	check(s.snapshot().stateHash === evidence.snapshot.stateHash, "Final state replay mismatch");
	check(s.traceHash() === evidence.traceHash, "Full trace replay mismatch");
	return s.traceHash();
}
export function runScenario(seats: 4 | 8, seed: number, detailed = true): ScenarioEvidence {
	const input = fixture(seats, seed),
		family = FAMILIES[seed % FAMILIES.length];
	let s = new PackSimulator(input),
		counter = 0;
	const attempts: Attempt[] = [];
	const metrics: ScenarioEvidence["metrics"] = {
		firstPriority: [],
		selected: [],
		replacements: 0,
		smaller: 0,
		declines: 0,
		blocked: 0,
		unfulfillable: 0,
		selectedBySeat: {},
		offeredByPriority: {},
	};
	const send = (
		command: Omit<SimulatorCommand, "requestId"> | SimulatorCommand,
		expectedError = false
	): CommandResult => {
		const c = {
			...command,
			requestId: "requestId" in command ? command.requestId : "proof-" + counter++,
		} as SimulatorCommand;
		const before = expectedError ? s.snapshot().stateHash : null;
		let result: CommandResult | undefined, failure: unknown;
		try {
			result = s.execute(c);
		} catch (error) {
			failure = error;
		}
		attempts.push({ command: c, expectedError, resultHash: failure ? null : digest(result) });
		if (expectedError) {
			check(failure, "Invalid command unexpectedly succeeded");
			check(s.snapshot().stateHash === before, "Rejected command mutated state");
		} else if (failure) throw failure;
		s.assertInvariants();
		return result!;
	};
	const offer = (id: string, player: string, d: PackDefinition): Offer => {
		const r = send({
			type: "create",
			opportunityId: id,
			playerId: player,
			definition: d,
		} as SimulatorCommand) as CreateResult;
		check(r.status === "offered", "Expected available offer");
		return r.offer;
	};
	const pick = (o: Offer) => {
		const selected = o.cards.slice(0, o.definition.keep);
		send({ type: "select", opportunityId: o.id, playerId: o.playerId, cards: selected } as SimulatorCommand);
		metrics.selected.push(...selected);
		const seat = (metrics.selectedBySeat[o.playerId] ??= { count: 0, affinitySum: 0 });
		for (const id of selected) {
			const score = o.trace.attempts.at(-1)!.candidates.find((c) => c.cardId === id)!;
			seat.count++;
			seat.affinitySum += (1 + score.contributions.reduce((n, c) => n + c.normalized, 0)) / 2;
		}
	};
	const a = "seat-0",
		b = "seat-1";
	try {
		switch (family) {
			case "shared":
			case "rotation": {
				for (let stage = 0; stage < (family === "rotation" ? seats : 1); stage++) {
					const result = send({
						type: "stage",
						stage,
						definition: definition({ kind: "shared", options: 2 }),
					} as SimulatorCommand) as { order: string[]; offers: CreateResult[] };
					metrics.firstPriority.push(result.order[0]);
					for (const [position, r] of result.offers.entries()) {
						check(r.status === "offered", "Shared stage could not fulfill fixture offer");
						const entry = (metrics.offeredByPriority[String(position)] ??= { offers: 0, options: 0 });
						entry.offers++;
						entry.options += r.offer.cards.length;
						pick(r.offer);
					}
				}
				if (family === "rotation")
					check(new Set(metrics.firstPriority).size === seats, "Priority did not rotate across all seats");
				break;
			}
			case "partial-tribal": {
				const o = offer(
					"tiny",
					a,
					definition({ kind: "tribal", tribe: "tiny", categories: ["tribal"], options: 5, boosterCost: 1 })
				);
				check(o.cards.length === 2 && o.replacement === null, "Partial tribe did not offer remaining options");
				metrics.smaller++;
				s = PackSimulator.restore(s.snapshot()); // disconnect recovery preserves the original offer and holds
				pick(o);
				check(s.boosterBalance(a) === 3, "Successful reward not charged once");
				break;
			}
			case "replacement": {
				const o = offer(
					"fallback",
					a,
					definition({
						kind: "tribal",
						tribe: "exhausted",
						categories: ["tribal"],
						options: 5,
						boosterCost: 1,
					})
				);
				check(o.cards.length === 5 && o.replacement === "archetype-0", "Incorrect replacement reward");
				metrics.replacements++;
				pick(o);
				break;
			}
			case "unfulfillable": {
				const r = send({
					type: "create",
					opportunityId: "no-legal",
					playerId: a,
					definition: definition({
						kind: "tribal",
						tribe: "exhausted",
						categories: ["tribal"],
						fallbackCategories: ["tribal"],
						allowedColors: [],
						boosterCost: 1,
					}),
				} as SimulatorCommand) as CreateResult;
				check(
					r.status === "unfulfillable" && s.boosterBalance(a) === 4 && s.pool(a).length === 0,
					"Failure spent/allocated resources"
				);
				metrics.unfulfillable++;
				break;
			}
			case "contention": {
				const d = definition({ categories: ["utility-land"], options: 5, signals: {} });
				const o = offer("hold", a, d);
				const blocked = send({
					type: "create",
					opportunityId: "wait",
					playerId: b,
					definition: d,
				} as SimulatorCommand) as CreateResult;
				check(blocked.status === "temporarily-unavailable", "Held cards confused with exhaustion");
				metrics.blocked++;
				send({ type: "grant", playerId: b, cardId: o.cards[0] } as SimulatorCommand, true);
				pick(o);
				pick(offer("wait", b, d));
				break;
			}
			case "decline": {
				const o = offer("decline", a, definition({ boosterCost: 1 }));
				send(
					{ type: "decline", opportunityId: o.id, playerId: a, cardId: "staple-0" } as SimulatorCommand,
					true
				);
				const c: SimulatorCommand = {
					type: "decline",
					requestId: "decline-once",
					opportunityId: o.id,
					playerId: a,
					cardId: o.cards[0],
				};
				send(c);
				send(c);
				metrics.declines++;
				check(
					s.boosterBalance(a) === 4 && s.pool(a).length === 0 && s.available(b, o.cards[0]) === 0,
					"Decline accounting incorrect"
				);
				send({ type: "grant", playerId: b, cardId: o.cards[0] } as SimulatorCommand, true);
				const closed = send({
					type: "create",
					opportunityId: o.id,
					playerId: a,
					definition: o.definition,
				} as SimulatorCommand) as CreateResult;
				check(
					closed.status === "closed" && closed.offer.status === "declined",
					"Declined opportunity rerolled"
				);
				pick(offer("later-earned", a, definition({ boosterCost: 1 })));
				check(s.boosterBalance(a) === 3, "Preserved booster unavailable later");
				break;
			}
			case "remainder-burn": {
				const o = offer("burn", a, definition({ remainder: "burn", keep: 2, options: 4 }));
				send(
					{ type: "select", opportunityId: o.id, playerId: a, cards: [o.cards[0]] } as SimulatorCommand,
					true
				);
				pick(o);
				for (const id of o.cards) check(s.available(b, id) === 0, "Explicit burn returned to supply");
				break;
			}
		}
		const c: SimulatorCommand = { type: "grant", requestId: "staple", playerId: a, cardId: "staple-0" };
		send(c);
		send(c);
		send({ ...c, playerId: b }, true);
		const dup = send({ type: "grant", playerId: a, cardId: "staple-0" } as SimulatorCommand) as { status: string };
		check(dup.status === "duplicate-destroyed", "Duplicate grant was not destroyed");
		const evidence = {
			seats,
			seed,
			family,
			input,
			attempts,
			snapshot: s.snapshot(),
			traceHash: s.traceHash(),
			metrics,
			...(detailed ? { audit: s.audit() } : {}),
		};
		replayEvidence(evidence);
		return evidence;
	} catch (error) {
		throw Object.assign(
			new Error("Scenario failed: " + family + ", seats=" + seats + ", seed=" + seed + ": " + String(error)),
			{
				evidence: {
					seats,
					seed,
					family,
					input,
					attempts,
					snapshot: s.snapshot(),
					traceHash: s.traceHash(),
					metrics,
					audit: s.audit(),
				},
			}
		);
	}
}
