import fs from "node:fs";
import { parse as yaml } from "yaml";
import { Random, MersenneTwister19937 } from "random-js";
import { cardIdentity, digest } from "../domain.js";
import {
	PackSimulator,
	type SimulatorInput,
	type SimulatorCommand,
	type PackDefinition,
	type Offer,
} from "../simulator.js";
import { engineIdentity } from "../simulationProof.js";
import { CATEGORIES, VERSION, requireObject, keys, object, type Catalog } from "./catalog.js";

export type Policy = "random-legal" | "affinity-directed";
export type Action =
	| Exclude<SimulatorCommand, { type: "select" } | { type: "decline" }>
	| { type: "select"; requestId: string; opportunityId: string; playerId: string }
	| { type: "decline"; requestId: string; opportunityId: string; playerId: string; cardId?: string }
	| { type: "recover"; requestId: string };
export interface Profile {
	schemaVersion: 1;
	name: string;
	cards: string[];
	seedStart: number;
	runs: number;
	settings: SimulatorInput["settings"];
	rosters: { players: SimulatorInput["players"]; actions: Action[] }[];
}
export interface Metrics {
	shortages: number;
	temporaryContention: number;
	smallerOffers: number;
	replacements: number;
	declines: number;
	burnedCopies: number;
	allocations: number;
	selectedCards: number;
	affinitySum: number;
	poolCounts: Record<string, number>;
	boosterBalances: Record<string, number>;
}
export interface Evidence {
	seal: string;
	version: string;
	engineHash: string;
	engineManifest: ReturnType<typeof researchEngineManifest>;
	release: ReturnType<PackSimulator["release"]>;
	audit?: ReturnType<PackSimulator["audit"]>;
	profileHash: string;
	catalogHash: string;
	policy: Policy;
	seed: number;
	input: SimulatorInput;
	steps: ({ command: SimulatorCommand; resultHash: string } | { recover: true; stateHash: string })[];
	snapshot: ReturnType<PackSimulator["snapshot"]>;
	traceHash: string;
	metrics: Metrics;
	failure?: { action: Action; command: SimulatorCommand | null; error: string };
}
const integer = (v: unknown, minimum: number) => Number.isSafeInteger(v) && Number(v) >= minimum;
const names = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every((s) => typeof s === "string" && s.length > 0) && new Set(v).size === v.length;
function definition(raw: unknown, archetypes: string[]) {
	const d = requireObject(raw, "Pack definition");
	keys(
		d,
		[
			"kind",
			"options",
			"keep",
			"categories",
			"fallbackCategories",
			"allowedColors",
			"signals",
			"tribe",
			"remainder",
			"boosterCost",
		],
		"pack definition"
	);
	if (
		!["shared", "private", "tribal"].includes(String(d.kind)) ||
		!integer(d.options, 1) ||
		!integer(d.keep, 1) ||
		Number(d.keep) > Number(d.options) ||
		!integer(d.boosterCost, 0) ||
		!["release", "burn"].includes(String(d.remainder))
	)
		throw new Error("Invalid pack sizes/kind/resources");
	for (const key of ["categories", "fallbackCategories", "allowedColors"])
		if (
			!names(d[key]) ||
			(d[key] as string[]).some(
				(v) => !(key === "allowedColors" ? ["W", "U", "B", "R", "G"] : CATEGORIES).includes(v as never)
			)
		)
			throw new Error("Invalid pack category/permission mask");
	if (
		!(d.categories as string[]).length ||
		(d.kind === "tribal" ? typeof d.tribe !== "string" || !d.tribe : d.tribe !== null)
	)
		throw new Error("Invalid category/tribe");
	for (const [key, value] of Object.entries(requireObject(d.signals, "Signals")))
		if (!archetypes.includes(key) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
			throw new Error("Invalid research signal");
}
export function parseProfile(text: string, c: Catalog): Profile {
	const p = requireObject(yaml(text, { maxAliasCount: 20 }), "Profile");
	keys(p, ["schemaVersion", "name", "cards", "seedStart", "runs", "settings", "rosters"], "profile");
	if (
		p.schemaVersion !== 1 ||
		typeof p.name !== "string" ||
		!p.name.trim() ||
		!names(p.cards) ||
		!p.cards.length ||
		!integer(p.seedStart, 0) ||
		!integer(p.runs, 1) ||
		Number(p.runs) > 50000 ||
		!Number.isSafeInteger(Number(p.seedStart) + Number(p.runs)) ||
		!Array.isArray(p.rosters) ||
		!p.rosters.length
	)
		throw new Error("Invalid profile identity/subset/seed range");
	const settings = requireObject(p.settings, "Settings");
	keys(settings, ["guidance", "baseWeight"], "settings");
	if (
		typeof settings.guidance !== "number" ||
		!Number.isFinite(settings.guidance) ||
		settings.guidance < 0 ||
		settings.guidance > 1 ||
		typeof settings.baseWeight !== "number" ||
		!Number.isFinite(settings.baseWeight) ||
		settings.baseWeight <= 0 ||
		settings.baseWeight > 1e6
	)
		throw new Error("Invalid explicit scoring settings");
	const sizes = new Set<number>();
	for (const raw of p.rosters) {
		const roster = requireObject(raw, "Roster");
		keys(roster, ["players", "actions"], "roster");
		if (
			!Array.isArray(roster.players) ||
			![4, 8].includes(roster.players.length) ||
			sizes.has(roster.players.length) ||
			!Array.isArray(roster.actions) ||
			!roster.actions.length
		)
			throw new Error("Exactly one explicit roster per four/eight seat count");
		sizes.add(roster.players.length);
		const ids = new Set<string>();
		for (const rawPlayer of roster.players) {
			const player = requireObject(rawPlayer, "Player");
			keys(player, ["id", "kind", "boosters"], "player");
			if (
				typeof player.id !== "string" ||
				!/^[a-z][a-z0-9-]*$/.test(player.id) ||
				ids.has(player.id) ||
				!["human", "bot"].includes(String(player.kind)) ||
				!integer(player.boosters, 0)
			)
				throw new Error("Invalid player/resource");
			ids.add(player.id);
		}
		for (const rawAction of roster.actions) {
			const a = requireObject(rawAction, "Action");
			const allowed: Record<string, string[]> = {
				create: ["opportunityId", "playerId", "definition"],
				select: ["opportunityId", "playerId"],
				decline: ["opportunityId", "playerId", "cardId"],
				grant: ["playerId", "cardId"],
				stage: ["stage", "definition"],
				recover: [],
			};
			if (
				typeof a.type !== "string" ||
				!Object.hasOwn(allowed, a.type) ||
				typeof a.requestId !== "string" ||
				!a.requestId ||
				a.requestId.startsWith("stage:")
			)
				throw new Error("Invalid explicit action");
			keys(a, ["type", "requestId", ...allowed[a.type]], "action");
			if (
				["create", "select", "decline", "grant"].includes(a.type) &&
				(typeof a.playerId !== "string" || !ids.has(a.playerId))
			)
				throw new Error("Unknown action player");
			if (
				["create", "select", "decline"].includes(a.type) &&
				(typeof a.opportunityId !== "string" || !a.opportunityId)
			)
				throw new Error("Missing opportunity identity");
			if (a.type === "stage" && !integer(a.stage, 0)) throw new Error("Invalid stage index");
			if (a.type === "create" || a.type === "stage") definition(a.definition, c.archetypes);
			if (a.type === "stage" && (a.definition as PackDefinition).kind !== "shared")
				throw new Error("Stage requires shared pack");
			if (a.type === "create" && (a.definition as PackDefinition).kind === "shared")
				throw new Error("Shared offers require a rotating-priority stage action");
			if ((a.type === "grant" || a.cardId !== undefined) && (typeof a.cardId !== "string" || !a.cardId))
				throw new Error("Missing grant/decline card identity");
		}
	}
	const profile = structuredClone(p) as unknown as Profile;
	profile.cards = profile.cards.map((id) => (/^card-[a-f0-9]{64}$/.test(id) ? id : cardIdentity(id)));
	profile.cards.sort();
	profile.rosters.sort((a, b) => a.players.length - b.players.length);
	for (const roster of profile.rosters) roster.players.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	if (new Set(profile.cards).size !== profile.cards.length) throw new Error("Duplicate logical card in subset");
	for (const id of profile.cards) {
		const card = c.cards.find((card) => card.id === id);
		if (
			!card ||
			card.issues.length ||
			!card.metadata?.oracleId ||
			!card.metadata.colorIdentity ||
			!card.annotation?.category ||
			!card.annotation.tribes ||
			!card.annotation.archetypes
		)
			throw new Error("Incomplete experiment candidate: " + id);
	}
	for (const roster of profile.rosters)
		for (const action of roster.actions) {
			if (action.type === "grant" || (action.type === "decline" && action.cardId)) {
				const id = /^card-[a-f0-9]{64}$/.test(action.cardId!) ? action.cardId! : cardIdentity(action.cardId!);
				if (!profile.cards.includes(id)) throw new Error("Action card outside subset");
				action.cardId = id;
			}
		}
	return profile;
}
function buildEngineManifest() {
	return {
		version: VERSION,
		simulator: engineIdentity(),
		runtime: process.versions.node,
		dependencies: ["yaml", "csv-parse", "random-js"].map((name) => ({
			name,
			version: JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, "utf8")).version,
		})),
		sources: [
			"catalog.js",
			"snapshot.js",
			"reports.js",
			"experiments.js",
			"cli.js",
			"../diff.js",
			"../import.js",
		].map((path) => ({
			path,
			hash: digest(fs.readFileSync(new URL(path, import.meta.url), "utf8")),
		})),
	};
}
let cachedManifest: ReturnType<typeof buildEngineManifest> | null = null;
export function researchEngineManifest() {
	return structuredClone((cachedManifest ??= buildEngineManifest()));
}
export function researchEngineIdentity() {
	return digest(researchEngineManifest());
}
function choose(o: Offer, policy: Policy, seed: string, count: number) {
	if (policy === "random-legal") {
		const rng = new Random(
			MersenneTwister19937.seedWithArray(
				digest(seed)
					.match(/.{8}/g)!
					.map((v) => parseInt(v, 16))
			)
		);
		return rng.shuffle([...o.cards]).slice(0, count);
	}
	const scores = o.trace.attempts.at(-1)!.candidates;
	const score = (id: string) =>
		scores.find((c) => c.cardId === id)!.contributions.reduce((n, c) => n + c.normalized, 0);
	return [...o.cards].sort((a, b) => score(b) - score(a) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, count);
}
function sealedEvidence(value: Omit<Evidence, "seal">): Evidence {
	const payload = JSON.parse(JSON.stringify(value)) as Omit<Evidence, "seal">;
	return { ...payload, seal: digest(payload) };
}
export function runExperiment(
	c: Catalog,
	p: Profile,
	rosterIndex: number,
	seed: number,
	policy: Policy,
	detailed = true
): Evidence {
	const roster = p.rosters[rosterIndex];
	const profileHash = digest(p),
		catalogHash = digest(c);
	const input: SimulatorInput = {
		seed: `research:${digest({ cards: p.cards, settings: p.settings, roster })}:${seed}`,
		engineHash: researchEngineIdentity(),
		players: roster.players,
		archetypes: c.archetypes,
		settings: p.settings,
		cards: p.cards.map((id) => {
			const card = c.cards.find((c) => c.id === id)!;
			return {
				cardId: id,
				category: card.annotation!.category!,
				colors: card.metadata!.colorIdentity!,
				tribes: card.annotation!.tribes!,
				archetypes: card.annotation!.archetypes!,
				affinities: {},
				humanAffinities: card.annotation!.affinities ?? {},
			};
		}),
	};
	let s = new PackSimulator(input);
	const steps: Evidence["steps"] = [];
	const seenOffers = new Set<string>();
	const seenRequests = new Set<string>();
	let attemptedAction: Action | undefined,
		attemptedCommand: SimulatorCommand | null = null;
	const metrics: Metrics = {
		shortages: 0,
		temporaryContention: 0,
		smallerOffers: 0,
		replacements: 0,
		declines: 0,
		burnedCopies: 0,
		allocations: 0,
		selectedCards: 0,
		affinitySum: 0,
		poolCounts: {},
		boosterBalances: {},
	};
	try {
		for (const action of roster.actions) {
			attemptedAction = action;
			attemptedCommand = null;
			if (action.type === "recover") {
				const state = s.snapshot();
				s = PackSimulator.restore(state);
				steps.push({ recover: true, stateHash: state.stateHash });
				continue;
			}
			let command: SimulatorCommand;
			const previous =
				action.type === "select" || action.type === "decline" ? s.offer(action.opportunityId) : null;
			if (action.type === "select" || action.type === "decline") {
				if (!previous || previous.playerId !== action.playerId)
					throw new Error("Selection has no matching offer");
				const chosen = choose(
					previous,
					policy,
					`${input.seed}:selection:${policy}:${action.requestId}:${previous.id}`,
					action.type === "select" ? previous.definition.keep : 1
				);
				command =
					action.type === "select"
						? { ...action, cards: chosen }
						: { ...action, cardId: action.cardId ?? chosen[0] };
			} else command = action;
			attemptedCommand = command;
			const before = new Map(roster.players.map((p) => [p.id, s.pool(p.id).length]));
			const result = s.execute(command);
			const firstRequest = !seenRequests.has(command.requestId);
			seenRequests.add(command.requestId);
			steps.push({ command, resultHash: digest(result) });
			const results = action.type === "stage" ? (result as { offers: unknown[] }).offers : [result];
			for (const r of firstRequest ? results : [])
				if (object(r)) {
					if (r.status === "unfulfillable") metrics.shortages++;
					if (r.status === "temporarily-unavailable") metrics.temporaryContention++;
					if (r.status === "offered" && object(r.offer)) {
						const o = r.offer as unknown as Offer;
						if (!seenOffers.has(o.id)) {
							if (o.cards.length < o.definition.options) metrics.smallerOffers++;
							if (o.replacement) metrics.replacements++;
							seenOffers.add(o.id);
						}
					}
				}
			if (previous?.status === "open" && (action.type === "select" || action.type === "decline")) {
				const resolved = result as Offer;
				metrics.burnedCopies += resolved.burned.length;
				metrics.selectedCards += resolved.selected.length;
				if (resolved.status === "declined") metrics.declines++;
				for (const id of resolved.selected)
					metrics.affinitySum +=
						(1 +
							previous.trace.attempts
								.at(-1)!
								.candidates.find((c) => c.cardId === id)!
								.contributions.reduce((n, c) => n + c.normalized, 0)) /
						2;
			}
			for (const player of roster.players)
				metrics.allocations += s.pool(player.id).length - before.get(player.id)!;
			s.assertInvariants();
		}
		for (const player of roster.players) {
			metrics.poolCounts[player.id] = s.pool(player.id).length;
			metrics.boosterBalances[player.id] = s.boosterBalance(player.id);
		}
		const evidence = sealedEvidence({
			version: VERSION,
			engineHash: input.engineHash,
			engineManifest: researchEngineManifest(),
			release: s.release(),
			audit: detailed ? s.audit() : undefined,
			profileHash,
			catalogHash,
			policy,
			seed,
			input,
			steps,
			snapshot: s.snapshot(),
			traceHash: s.traceHash(),
			metrics,
		});
		replay(evidence);
		return evidence;
	} catch (error) {
		throw Object.assign(new Error(String(error)), {
			evidence: sealedEvidence({
				version: VERSION,
				engineHash: input.engineHash,
				engineManifest: researchEngineManifest(),
				release: s.release(),
				audit: s.audit(),
				profileHash,
				catalogHash,
				policy,
				seed,
				input,
				steps,
				snapshot: s.snapshot(),
				traceHash: s.traceHash(),
				metrics,
				failure: attemptedAction
					? { action: attemptedAction, command: attemptedCommand, error: String(error) }
					: undefined,
			}),
		});
	}
}
export function replay(e: Evidence) {
	const { seal, ...payload } = e;
	if (seal !== digest(payload)) throw new Error("Research evidence seal mismatch");
	if (e.version !== VERSION || e.engineHash !== researchEngineIdentity() || e.input.engineHash !== e.engineHash)
		throw new Error("Research evidence engine/version mismatch");
	if (digest(e.engineManifest) !== e.engineHash) throw new Error("Research engine manifest mismatch");
	let s = new PackSimulator(e.input);
	for (const step of e.steps) {
		if ("recover" in step) {
			if (s.snapshot().stateHash !== step.stateHash) throw new Error("Recovery replay mismatch");
			s = PackSimulator.restore(s.snapshot());
		} else if (digest(s.execute(step.command)) !== step.resultHash)
			throw new Error("Research result replay mismatch");
		s.assertInvariants();
	}
	if (digest(s.snapshot()) !== digest(e.snapshot) || s.traceHash() !== e.traceHash)
		throw new Error("Research final replay mismatch");
	if (digest(s.release()) !== digest(e.release) || (e.audit && digest(s.audit()) !== digest(e.audit)))
		throw new Error("Research release/explanation replay mismatch");
	if (e.failure) {
		const before = s.snapshot().stateHash;
		let rejected: unknown;
		try {
			if (e.failure.command) s.execute(e.failure.command);
			else if (e.failure.action.type === "select" || e.failure.action.type === "decline") {
				const offer = s.offer(e.failure.action.opportunityId);
				if (!offer || offer.playerId !== e.failure.action.playerId)
					throw new Error("Selection has no matching offer");
			} else throw new Error("Unreplayable failed research action");
		} catch (error) {
			rejected = error;
		}
		if (!rejected || String(rejected) !== e.failure.error || s.snapshot().stateHash !== before)
			throw new Error("Failure replay mismatch");
	}
	return s.traceHash();
}
