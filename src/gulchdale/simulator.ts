import { MersenneTwister19937, Random } from "random-js";
import { component, digest, type ReleaseReference } from "./domain.js";
import { tribalCapacity, type SupplyCategory } from "./supply.js";

export const SIMULATOR_VERSION = "phase2-immediate-v1";
const COLORS = ["W", "U", "B", "R", "G"];
const CATEGORIES: SupplyCategory[] = [
	"commander",
	"commander-support",
	"main-pool",
	"utility-land",
	"tribal",
	"commander-staple",
];
export interface SimulatorCard {
	cardId: string;
	category: SupplyCategory;
	colors: string[];
	tribes: string[];
	archetypes: string[];
	affinities: Record<string, number>;
	humanAffinities?: Record<string, number>;
}
export interface SimulatorInput {
	seed: string;
	engineHash: string;
	players: { id: string; kind: "human" | "bot"; boosters: number }[];
	cards: SimulatorCard[];
	archetypes: string[];
	settings: { guidance: number; baseWeight: number };
}
export interface PackDefinition {
	kind: "shared" | "private" | "tribal";
	options: number;
	keep: number;
	categories: SupplyCategory[];
	fallbackCategories: SupplyCategory[];
	allowedColors: string[];
	signals: Record<string, number>;
	tribe: string | null;
	remainder: "release" | "burn";
	boosterCost: number;
}
export interface CandidateScore {
	cardId: string;
	reasons: string[];
	permanentEligible: boolean;
	available: number;
	contributions: {
		archetype: string;
		signal: number;
		affinity: number;
		normalized: number;
		humanOverride: boolean;
	}[];
	weight: number;
}
export interface Offer {
	id: string;
	playerId: string;
	definition: PackDefinition;
	cards: string[];
	status: "open" | "selected" | "declined";
	selected: string[];
	burned: string[];
	replacement: string | null;
	trace: {
		stateHash: string;
		seed: string;
		attempts: {
			pool: string;
			candidates: CandidateScore[];
			draws: { value: number; totalWeight: number; chosen: string }[];
		}[];
	};
}
export type CreateResult =
	| { status: "offered" | "closed"; offer: Offer }
	| { status: "temporarily-unavailable" | "unfulfillable"; trace: Offer["trace"] };
export type SimulatorCommand =
	| { type: "create"; requestId: string; opportunityId: string; playerId: string; definition: PackDefinition }
	| { type: "select"; requestId: string; opportunityId: string; playerId: string; cards: string[] }
	| { type: "decline"; requestId: string; opportunityId: string; playerId: string; cardId: string }
	| { type: "grant"; requestId: string; playerId: string; cardId: string }
	| { type: "stage"; requestId: string; stage: number; definition: PackDefinition };
export type CommandResult =
	| CreateResult
	| Offer
	| { status: "allocated" | "duplicate-destroyed"; cardId: string }
	| { order: string[]; offers: CreateResult[] };
interface State {
	pools: Map<string, Set<string>>;
	used: Map<string, number>;
	burned: Map<string, number>;
	holds: Map<string, number>;
	boosters: Map<string, number>;
	offers: Map<string, Offer>;
	bindings: Map<string, string>;
	requests: Map<string, { signature: string; result: CommandResult; resultHash: string }>;
	nextStage: number;
}
export interface SimulatorSnapshot {
	version: string;
	input: SimulatorInput;
	commands: SimulatorCommand[];
	stateHash: string;
}
const integer = (n: number, minimum: number) => Number.isSafeInteger(n) && n >= minimum;
const unique = (values: string[]) =>
	values.every((v) => typeof v === "string" && v.length > 0) && new Set(values).size === values.length;
const randomFor = (seed: string) =>
	new Random(
		MersenneTwister19937.seedWithArray(
			digest(seed)
				.match(/.{8}/g)!
				.map((v) => parseInt(v, 16))
		)
	);

/** Offline, synchronous single-owner transactions. Not a live database allocator. */
export class PackSimulator {
	private readonly input: SimulatorInput;
	private readonly cards: Map<string, SimulatorCard>;
	private state: State;
	private readonly commands: SimulatorCommand[] = [];
	private readonly initialOrder: string[];
	private readonly references: ReleaseReference;
	private readonly inputHash: string;
	private readonly supplyKeys = new Map<string, Map<string, string>>();
	private readonly capacities = new Map<string, number>();
	constructor(input: SimulatorInput) {
		if (![4, 8].includes(input.players.length) || !unique(input.players.map((p) => p.id)))
			throw new Error("Exactly four/eight unique seats required");
		if (typeof input.seed !== "string" || !input.seed || !/^[a-f0-9]{64}$/.test(input.engineHash))
			throw new Error("Invalid seed/engine identity");
		if (!unique(input.cards.map((c) => c.cardId)) || !unique(input.archetypes))
			throw new Error("Duplicate card or archetype identity");
		if (
			!Number.isFinite(input.settings.guidance) ||
			input.settings.guidance < 0 ||
			input.settings.guidance > 1 ||
			!Number.isFinite(input.settings.baseWeight) ||
			input.settings.baseWeight <= 0 ||
			input.settings.baseWeight > 1e6
		)
			throw new Error("Invalid scoring settings");
		for (const p of input.players)
			if (!["human", "bot"].includes(p.kind) || !integer(p.boosters, 0)) throw new Error("Invalid seat");
		for (const c of input.cards) {
			if (
				!CATEGORIES.includes(c.category) ||
				!unique(c.colors) ||
				c.colors.some((v) => !COLORS.includes(v)) ||
				!unique(c.tribes) ||
				!unique(c.archetypes) ||
				c.archetypes.some((v) => !input.archetypes.includes(v))
			)
				throw new Error("Invalid card metadata");
			for (const entries of [c.affinities, c.humanAffinities ?? {}])
				for (const [key, value] of Object.entries(entries))
					if (!input.archetypes.includes(key) || !Number.isFinite(value) || value < 0 || value > 1)
						throw new Error("Invalid affinity");
		}
		this.input = structuredClone(input);
		this.input.players.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		this.input.cards.sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
		this.input.archetypes.sort();
		this.inputHash = digest(this.input);
		this.cards = new Map(this.input.cards.map((c) => [c.cardId, c]));
		for (const p of this.input.players) {
			const keys = new Map<string, string>();
			for (const c of this.input.cards) {
				const key = JSON.stringify(c.category === "commander-staple" ? [p.id, c.cardId] : [c.cardId]);
				keys.set(c.cardId, key);
				this.capacities.set(key, c.category === "tribal" ? tribalCapacity(this.input.players.length) : 1);
			}
			this.supplyKeys.set(p.id, keys);
		}
		this.state = {
			pools: new Map(this.input.players.map((p) => [p.id, new Set()])),
			used: new Map(),
			burned: new Map(),
			holds: new Map(),
			boosters: new Map(this.input.players.map((p) => [p.id, p.boosters])),
			offers: new Map(),
			bindings: new Map(),
			requests: new Map(),
			nextStage: 0,
		};
		this.initialOrder = randomFor(input.seed + ":seat-order").shuffle(this.input.players.map((p) => p.id));
		this.references = {
			pool: component("pool", { cards: this.input.cards.map(({ cardId, category }) => ({ cardId, category })) })
				.hash,
			metadata: component("metadata", { cards: this.input.cards, archetypes: this.input.archetypes }).hash,
			rules: component("rules", {
				version: SIMULATOR_VERSION,
				settings: this.input.settings,
				seats: this.input.players.length,
				tribalCapacity: tribalCapacity(this.input.players.length),
				lifecycle: "immediate-hold-select-or-decline",
			}).hash,
			engine: this.input.engineHash,
		};
	}
	private player(id: string) {
		if (!this.state.pools.has(id)) throw new Error("Unknown player");
	}
	private card(id: string) {
		const c = this.cards.get(id);
		if (!c) throw new Error("Unknown card");
		return c;
	}
	private key(playerId: string, cardId: string) {
		const key = this.supplyKeys.get(playerId)?.get(cardId);
		if (!key) throw new Error("Unknown player/card");
		return key;
	}
	private capacity(cardId: string) {
		return this.card(cardId).category === "tribal" ? tribalCapacity(this.input.players.length) : 1;
	}
	private held(playerId: string, cardId: string) {
		return this.state.holds.get(this.key(playerId, cardId)) ?? 0;
	}
	private permanent(playerId: string, cardId: string) {
		const key = this.key(playerId, cardId);
		return this.capacity(cardId) - (this.state.used.get(key) ?? 0) - (this.state.burned.get(key) ?? 0);
	}
	available(playerId: string, cardId: string) {
		this.player(playerId);
		return this.permanent(playerId, cardId) - this.held(playerId, cardId);
	}
	pool(playerId: string) {
		this.player(playerId);
		return [...this.state.pools.get(playerId)!].sort();
	}
	boosterBalance(playerId: string) {
		this.player(playerId);
		return this.state.boosters.get(playerId)!;
	}
	offer(id: string) {
		const o = this.state.offers.get(id);
		return o ? structuredClone(o) : null;
	}
	release() {
		return { ...this.references };
	}
	private view() {
		const entries = <T>(map: Map<string, T>) => [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return {
			input: this.inputHash,
			release: this.references,
			pools: entries(this.state.pools).map(([p, cards]) => [p, [...cards].sort()]),
			used: entries(this.state.used),
			burned: entries(this.state.burned),
			holds: entries(this.state.holds),
			boosters: entries(this.state.boosters),
			offers: entries(this.state.offers).map(([id, o]) => [
				id,
				{
					playerId: o.playerId,
					definition: o.definition,
					cards: o.cards,
					status: o.status,
					selected: o.selected,
					burned: o.burned,
					replacement: o.replacement,
				},
			]),
			bindings: entries(this.state.bindings),
			requests: entries(this.state.requests).map(([id, r]) => [id, r.signature, r.resultHash]),
			nextStage: this.state.nextStage,
		};
	}
	traceHash() {
		return digest([...this.state.requests.entries()].map(([id, r]) => [id, r.signature, r.resultHash]));
	}
	audit() {
		return structuredClone({
			release: this.references,
			inputHash: this.inputHash,
			commands: this.commands,
			results: [...this.state.requests.entries()],
		});
	}
	snapshot(): SimulatorSnapshot {
		return structuredClone({
			version: SIMULATOR_VERSION,
			input: this.input,
			commands: this.commands,
			stateHash: digest(this.view()),
		});
	}
	static restore(snapshot: SimulatorSnapshot) {
		if (snapshot.version !== SIMULATOR_VERSION) throw new Error("Unsupported simulator version");
		const s = new PackSimulator(snapshot.input);
		for (const command of snapshot.commands) s.execute(command);
		if (s.snapshot().stateHash !== snapshot.stateHash) throw new Error("Snapshot replay mismatch");
		return s;
	}
	private definition(d: PackDefinition) {
		if (
			!["shared", "private", "tribal"].includes(d.kind) ||
			!integer(d.options, 1) ||
			!integer(d.keep, 1) ||
			d.keep > d.options ||
			!unique(d.categories) ||
			!d.categories.length ||
			d.categories.some((c) => !CATEGORIES.includes(c)) ||
			!unique(d.fallbackCategories) ||
			d.fallbackCategories.some((c) => !CATEGORIES.includes(c)) ||
			!unique(d.allowedColors) ||
			d.allowedColors.some((c) => !COLORS.includes(c)) ||
			!["release", "burn"].includes(d.remainder) ||
			!integer(d.boosterCost, 0) ||
			(d.kind === "tribal" ? typeof d.tribe !== "string" || !d.tribe : d.tribe !== null)
		)
			throw new Error("Invalid pack definition");
		for (const [key, value] of Object.entries(d.signals))
			if (!this.input.archetypes.includes(key) || !Number.isFinite(value) || value < 0 || value > 1)
				throw new Error("Invalid signal");
	}
	private candidates(playerId: string, d: PackDefinition, pool: string): CandidateScore[] {
		const heldByPlayer = new Set(
			[...this.state.offers.values()]
				.filter((o) => o.status === "open" && o.playerId === playerId)
				.flatMap((o) => o.cards)
		);
		const signals = Object.entries(d.signals).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		const signalTotal = signals.reduce((n, [, v]) => n + v, 0);
		return this.input.cards.map((c) => {
			const reasons: string[] = [];
			if (c.category === "commander-staple") reasons.push("grant-only");
			if (!(pool.startsWith("archetype:") ? d.fallbackCategories : d.categories).includes(c.category))
				reasons.push("category");
			if (pool.startsWith("archetype:") && !c.archetypes.includes(pool.slice(10))) reasons.push("archetype");
			if (pool === "tribal" && (c.category !== "tribal" || !c.tribes.includes(d.tribe!))) reasons.push("tribe");
			if (!c.colors.every((v) => d.allowedColors.includes(v))) reasons.push("permission");
			if (this.state.pools.get(playerId)!.has(c.cardId)) reasons.push("owned");
			if (this.permanent(playerId, c.cardId) === 0) reasons.push("consumed");
			const permanentEligible = reasons.length === 0;
			const available = this.available(playerId, c.cardId);
			if (permanentEligible && (available === 0 || heldByPlayer.has(c.cardId))) reasons.push("held");
			const contributions = signals.map(([archetype, signal]) => {
				const humanOverride = Object.hasOwn(c.humanAffinities ?? {}, archetype);
				const affinity = humanOverride
					? c.humanAffinities![archetype]
					: Object.hasOwn(c.affinities, archetype)
						? c.affinities[archetype]
						: 0.5;
				return {
					archetype,
					signal,
					affinity,
					normalized: signalTotal ? (signal / signalTotal) * (2 * affinity - 1) : 0,
					humanOverride,
				};
			});
			const weight = reasons.length
				? 0
				: this.input.settings.baseWeight *
					Math.exp(this.input.settings.guidance * contributions.reduce((n, c) => n + c.normalized, 0));
			return { cardId: c.cardId, reasons, permanentEligible, available, contributions, weight };
		});
	}
	private create(opportunityId: string, playerId: string, definition: PackDefinition): CreateResult {
		this.player(playerId);
		this.definition(definition);
		if (!opportunityId || opportunityId.startsWith("stage:"))
			throw new Error("Invalid/reserved opportunity identity");
		return this.createBound(opportunityId, playerId, definition);
	}
	private createBound(opportunityId: string, playerId: string, definition: PackDefinition): CreateResult {
		const signature = digest({ playerId, definition });
		const binding = this.state.bindings.get(opportunityId);
		if (binding && binding !== signature) throw new Error("Opportunity identity reused with different input");
		const prior = this.state.offers.get(opportunityId);
		if (prior) return { status: prior.status === "open" ? "offered" : "closed", offer: structuredClone(prior) };
		if (this.boosterBalance(playerId) < definition.boosterCost) throw new Error("Insufficient booster balance");
		this.state.bindings.set(opportunityId, signature);
		const seed = digest({ seed: this.input.seed, opportunityId, playerId, definition });
		const rng = randomFor(seed);
		const trace: Offer["trace"] = { stateHash: digest(this.view()), seed, attempts: [] };
		const heldBoosters = [...this.state.offers.values()]
			.filter((o) => o.playerId === playerId && o.status === "open")
			.reduce((n, o) => n + o.definition.boosterCost, 0);
		if (this.boosterBalance(playerId) - heldBoosters < definition.boosterCost)
			return { status: "temporarily-unavailable", trace };
		const pools = [definition.kind === "tribal" ? "tribal" : "primary"];
		if (definition.kind === "tribal")
			pools.push(
				...Object.entries(definition.signals)
					.filter(([, v]) => v > 0)
					.sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
					.map(([id]) => "archetype:" + id)
			);
		for (const pool of pools) {
			const candidates = this.candidates(playerId, definition, pool);
			const attempt: Offer["trace"]["attempts"][number] = { pool, candidates, draws: [] };
			trace.attempts.push(attempt);
			const permanent = candidates.filter((c) => c.permanentEligible).length;
			const target = pool === "tribal" ? Math.min(permanent, definition.options) : definition.options;
			const eligible = candidates.filter((c) => c.weight > 0);
			if (permanent < definition.keep || (pool !== "tribal" && permanent < target)) continue;
			if (eligible.length < target) return { status: "temporarily-unavailable", trace };
			const remaining = [...eligible],
				picked: string[] = [];
			for (let i = 0; i < target; i++) {
				const totalWeight = remaining.reduce((n, c) => n + c.weight, 0);
				const value = rng.real(0, totalWeight, false);
				let index = 0,
					cumulative = remaining[0].weight;
				while (value >= cumulative && index < remaining.length - 1) cumulative += remaining[++index].weight;
				const chosen = remaining.splice(index, 1)[0].cardId;
				picked.push(chosen);
				attempt.draws.push({ value, totalWeight, chosen });
			}
			const offer: Offer = {
				id: opportunityId,
				playerId,
				definition: structuredClone(definition),
				cards: picked,
				status: "open",
				selected: [],
				burned: [],
				replacement: pool.startsWith("archetype:") ? pool.slice(10) : null,
				trace,
			};
			this.state.offers.set(opportunityId, offer);
			for (const id of picked) {
				const key = this.key(playerId, id);
				this.state.holds.set(key, (this.state.holds.get(key) ?? 0) + 1);
			}
			return { status: "offered", offer: structuredClone(offer) };
		}
		return { status: "unfulfillable", trace };
	}
	private resolve(playerId: string, opportunityId: string, selected: string[], burn: string | null): Offer {
		this.player(playerId);
		const o = this.state.offers.get(opportunityId);
		if (!o || o.playerId !== playerId || o.status !== "open") throw new Error("Offer is not open for this player");
		if (
			!unique(selected) ||
			selected.some((id) => !o.cards.includes(id)) ||
			(burn ? selected.length !== 0 || !o.cards.includes(burn) : selected.length !== o.definition.keep)
		)
			throw new Error("Invalid offer selection/burn");
		if (!burn && this.boosterBalance(playerId) < o.definition.boosterCost)
			throw new Error("Insufficient booster balance");
		if (selected.some((id) => this.state.pools.get(playerId)!.has(id)))
			throw new Error("Duplicate pool allocation");
		for (const id of o.cards) {
			const key = this.key(playerId, id);
			this.state.holds.set(key, this.state.holds.get(key)! - 1);
		}
		for (const id of selected) {
			const key = this.key(playerId, id);
			this.state.used.set(key, (this.state.used.get(key) ?? 0) + 1);
			this.state.pools.get(playerId)!.add(id);
		}
		const burned = burn
			? [burn]
			: o.definition.remainder === "burn"
				? o.cards.filter((id) => !selected.includes(id))
				: [];
		for (const id of burned) {
			const key = this.key(playerId, id);
			this.state.burned.set(key, (this.state.burned.get(key) ?? 0) + 1);
		}
		if (!burn) this.state.boosters.set(playerId, this.boosterBalance(playerId) - o.definition.boosterCost);
		const resolved: Offer = { ...o, status: burn ? "declined" : "selected", selected: [...selected], burned };
		this.state.offers.set(opportunityId, resolved);
		return structuredClone(resolved);
	}
	private grant(playerId: string, cardId: string): CommandResult {
		this.player(playerId);
		this.card(cardId);
		if (this.state.pools.get(playerId)!.has(cardId)) return { status: "duplicate-destroyed", cardId };
		if (
			this.available(playerId, cardId) === 0 ||
			[...this.state.offers.values()].some(
				(o) => o.status === "open" && o.playerId === playerId && o.cards.includes(cardId)
			)
		)
			throw new Error("Card unavailable for grant");
		const key = this.key(playerId, cardId);
		this.state.used.set(key, (this.state.used.get(key) ?? 0) + 1);
		this.state.pools.get(playerId)!.add(cardId);
		return { status: "allocated", cardId };
	}
	execute(command: SimulatorCommand): CommandResult {
		if (!command.requestId || command.requestId.startsWith("stage:"))
			throw new Error("Invalid/reserved request identity");
		const signature = digest(command);
		const previous = this.state.requests.get(command.requestId);
		if (previous) {
			if (previous.signature !== signature) throw new Error("Request identity reused with different input");
			return structuredClone(previous.result);
		}
		const before = this.state;
		// Copy-on-write checkpoint: offer/result records are immutable after insertion.
		// Never clone the entire accumulated trace history for a small transaction.
		this.state = {
			...before,
			pools: new Map([...before.pools].map(([id, pool]) => [id, new Set(pool)])),
			used: new Map(before.used),
			burned: new Map(before.burned),
			holds: new Map(before.holds),
			boosters: new Map(before.boosters),
			offers: new Map(before.offers),
			bindings: new Map(before.bindings),
			requests: new Map(before.requests),
		};
		try {
			let result: CommandResult;
			switch (command.type) {
				case "create":
					result = this.create(command.opportunityId, command.playerId, command.definition);
					break;
				case "select":
					result = this.resolve(command.playerId, command.opportunityId, command.cards, null);
					break;
				case "decline":
					result = this.resolve(command.playerId, command.opportunityId, [], command.cardId);
					break;
				case "grant":
					result = this.grant(command.playerId, command.cardId);
					break;
				case "stage": {
					this.definition(command.definition);
					if (
						command.definition.kind !== "shared" ||
						command.stage !== this.state.nextStage ||
						[...this.state.offers.values()].some((o) => o.status === "open")
					)
						throw new Error("Invalid stage or unresolved offers");
					const offset = command.stage % this.initialOrder.length;
					const order = [...this.initialOrder.slice(offset), ...this.initialOrder.slice(0, offset)];
					result = {
						order,
						offers: order.map((playerId) =>
							this.createBound("stage:" + command.stage + ":" + playerId, playerId, command.definition)
						),
					};
					this.state.nextStage++;
					break;
				}
				default:
					throw new Error("Unknown command");
			}
			this.assertInvariants();
			this.state.requests.set(command.requestId, {
				signature,
				result: structuredClone(result),
				resultHash: digest(result),
			});
			this.commands.push(structuredClone(command));
			return structuredClone(result);
		} catch (error) {
			this.state = before;
			throw error;
		}
	}
	assertInvariants() {
		const expectedHolds = new Map<string, number>(),
			expectedBurns = new Map<string, number>(),
			expectedUsed = new Map<string, number>(),
			spent = new Map<string, number>();
		for (const o of this.state.offers.values()) {
			if (!unique(o.cards) || o.cards.length < o.definition.keep || o.cards.length > o.definition.options)
				throw new Error("Offer invariant");
			if (o.status === "open")
				for (const id of o.cards) {
					const key = this.key(o.playerId, id);
					expectedHolds.set(key, (expectedHolds.get(key) ?? 0) + 1);
				}
			for (const id of o.burned) {
				const key = this.key(o.playerId, id);
				expectedBurns.set(key, (expectedBurns.get(key) ?? 0) + 1);
			}
			if (o.status === "selected") spent.set(o.playerId, (spent.get(o.playerId) ?? 0) + o.definition.boosterCost);
			if (o.status === "declined" && (o.burned.length !== 1 || o.selected.length !== 0))
				throw new Error("Decline invariant");
		}
		for (const [player, pool] of this.state.pools)
			for (const id of pool) {
				const key = this.key(player, id);
				expectedUsed.set(key, (expectedUsed.get(key) ?? 0) + 1);
			}
		for (const p of this.input.players) {
			if (
				!integer(this.boosterBalance(p.id), 0) ||
				this.boosterBalance(p.id) !== p.boosters - (spent.get(p.id) ?? 0)
			)
				throw new Error("Booster invariant");
			if (
				[...this.state.offers.values()]
					.filter((o) => o.playerId === p.id && o.status === "open")
					.reduce((n, o) => n + o.definition.boosterCost, 0) > this.boosterBalance(p.id)
			)
				throw new Error("Booster hold invariant");
		}
		for (const [key, capacity] of this.capacities) {
			const used = this.state.used.get(key) ?? 0,
				burned = this.state.burned.get(key) ?? 0,
				held = this.state.holds.get(key) ?? 0;
			if (![used, burned, held].every((n) => integer(n, 0)) || used + burned + held > capacity)
				throw new Error("Supply invariant");
			if (
				(expectedUsed.get(key) ?? 0) !== used ||
				(expectedHolds.get(key) ?? 0) !== held ||
				(expectedBurns.get(key) ?? 0) !== burned
			)
				throw new Error("Ownership/hold/burn invariant");
		}
	}
}
