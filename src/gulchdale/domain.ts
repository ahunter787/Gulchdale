import crypto from "node:crypto";
export type Data = Record<string, unknown>;
export function canonical(value: unknown): string {
	if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
	if (value && typeof value === "object")
		return (
			"{" +
			Object.entries(value)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
				.join(",") +
			"}"
		);
	return JSON.stringify(value) ?? "null";
}
export const digest = (value: unknown) => crypto.createHash("sha256").update(canonical(value)).digest("hex");
export const bytesHash = (value: Buffer) => crypto.createHash("sha256").update(value).digest("hex");
export const cardIdentity = (name: string) => "card-" + digest(name.normalize("NFKC").trim().toLowerCase());
export interface CardRecord {
	id: string;
	name: string;
	data: Data;
}
export interface PrintingRecord {
	id: string;
	cardId: string;
	set: string;
	collectorNumber: string;
	data: Data;
}
export interface PoolEntry {
	id: string;
	cardId: string;
	printingId: string | null;
	quantity: number;
	sheets: string[];
	tags: string[];
	data: Data;
}
export interface SourceSnapshot {
	id: string;
	kind: string;
	path: string;
	bytes: Buffer;
}
export interface PersonalInjection {
	id: string;
	cardId: string;
	data: Data;
}
export interface SupplyPolicy {
	id: string;
	kind: string;
	playerCountScaling: Data | null;
	status: string;
}
export interface ArchetypeRecord {
	id: string;
	capacity: number | null;
	data: Data;
}
export interface TagRecord {
	id: string;
	data: Data;
}
export interface CardAffinity {
	cardId: string;
	archetypeId: string;
	score: number;
}
export interface Workspace {
	id: string;
	sources: SourceSnapshot[];
	cards: CardRecord[];
	printings: PrintingRecord[];
	pool: PoolEntry[];
	commanders: { cardId: string; data: Data }[];
	personalInjections: PersonalInjection[];
	supplyPolicies: SupplyPolicy[];
	archetypes: ArchetypeRecord[];
	tribes: TagRecord[];
	worldTags: TagRecord[];
	affinities: CardAffinity[];
	counts: Data;
	provenance: Data;
	rules: Data;
}
export interface HumanOverride {
	cardId: string;
	field: string;
	value: unknown;
}
export function applyOverrides(cards: CardRecord[], overrides: HumanOverride[]): CardRecord[] {
	const ids = new Set(cards.map((c) => c.id));
	for (const o of overrides) {
		if (!ids.has(o.cardId)) throw new Error("Override references unknown card " + o.cardId);
		if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(o.field) || ["__proto__", "constructor", "prototype"].includes(o.field))
			throw new Error("Invalid override field");
		if (o.field.startsWith("affinity:")) throw new Error("Use affinity.<archetype> override fields");
		if (
			o.field.startsWith("affinity.") &&
			(typeof o.value !== "number" || !Number.isFinite(o.value) || o.value < 0 || o.value > 1)
		)
			throw new Error("Affinity override must be in [0,1]");
	}
	return cards.map((c) => ({
		...c,
		data: {
			...c.data,
			...Object.fromEntries(overrides.filter((o) => o.cardId === c.id).map((o) => [o.field, o.value])),
		},
	}));
}
export function affinity(data: Data, archetype: string): number {
	const imported = data.importedAffinities as Record<string, number> | undefined;
	const score = data["affinity." + archetype] ?? imported?.[archetype];
	return typeof score === "number" ? score : 0.5;
}
export type ReleaseKind = "pool" | "metadata" | "rules" | "engine" | "environment";
export interface Release {
	kind: ReleaseKind;
	hash: string;
	payload: Data;
}
export interface ReleaseReference {
	pool: string;
	metadata: string;
	rules: string;
	engine: string;
}
export function component(kind: ReleaseKind, payload: Data): Release {
	return { kind, hash: digest({ kind, payload }), payload };
}
export function releasesFor(w: Workspace, overrides: HumanOverride[]): Release[] {
	const pool = component("pool", {
		entries: w.pool,
		supplyPolicies: w.supplyPolicies,
		commanders: w.commanders,
		personalInjections: w.personalInjections,
	});
	const metadata = component("metadata", {
		cards: applyOverrides(
			w.cards.map((c) => ({
				...c,
				data: {
					...c.data,
					...Object.fromEntries(
						w.affinities.filter((a) => a.cardId === c.id).map((a) => ["affinity." + a.archetypeId, a.score])
					),
				},
			})),
			overrides
		),
		printings: w.printings,
		archetypes: w.archetypes,
		tribes: w.tribes,
		worldTags: w.worldTags,
		affinities: w.affinities,
	});
	const rules = component("rules", w.rules);
	const engine = component("engine", w.provenance.engineIdentity as Data);
	const reference: ReleaseReference = {
		pool: pool.hash,
		metadata: metadata.hash,
		rules: rules.hash,
		engine: engine.hash,
	};
	const environment = component("environment", {
		reference,
		provenance: w.provenance,
		counts: w.counts,
		workspace: w.id,
	});
	return [pool, metadata, rules, engine, environment];
}
