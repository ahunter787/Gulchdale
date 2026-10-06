import fs from "node:fs";
import { parse as csv } from "csv-parse/sync";
import { parse as yaml } from "yaml";
import { bytesHash, cardIdentity, digest } from "../domain.js";
import type { SupplyCategory } from "../supply.js";

export const VERSION = "gulchdale-research-v1";
export const CATEGORIES: SupplyCategory[] = [
	"commander",
	"commander-support",
	"main-pool",
	"utility-land",
	"tribal",
	"commander-staple",
];
export const ROLES = ["fixing", "ramp", "draw", "removal", "enabler", "payoff"];
export interface Candidate {
	id: string;
	name: string;
	set: string | null;
	collectorNumber: string | null;
	oracleId: string | null;
	board: string;
	maybeboard: boolean;
}
export interface Source {
	source: string;
	capturedAt: string;
	status: number;
	body: string;
	hash: string;
}
export interface Bundle {
	version: string;
	capturedAt: string;
	candidateCsv: string;
	candidateHash: string;
	sources: Source[];
	errors: string[];
	hash: string;
}
export interface Annotation {
	name?: string;
	cardId?: string;
	category?: SupplyCategory;
	roles?: string[];
	tribes?: string[];
	archetypes?: string[];
	affinities?: Record<string, number>;
	evidence?: string;
	reviewNotes?: string;
}
export interface Annotations {
	schemaVersion: 1;
	archetypes: string[];
	cards: Annotation[];
	targets: Record<string, number | null>;
}
export interface Metadata {
	oracleId: string | null;
	printingIds: string[];
	manaValue: number | null;
	colorIdentity: string[] | null;
	typeLine: string | null;
	producedMana: string[] | null;
	oracleText: string | null;
}
export interface ResearchCard {
	id: string;
	name: string;
	rows: Candidate[];
	metadata: Metadata | null;
	annotation: Annotation | null;
	issues: string[];
}
export interface Catalog {
	version: string;
	bundleHash: string;
	annotationHash: string;
	archetypes: string[];
	targets: Record<string, number | null>;
	cards: ResearchCard[];
}
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function requireObject(v: unknown, label: string): Record<string, unknown> {
	if (!object(v)) throw new Error(label + " must be an object");
	return v;
}
export function keys(v: Record<string, unknown>, allowed: string[], label: string) {
	if (Object.keys(v).some((k) => !allowed.includes(k))) throw new Error("Unknown " + label + " field");
}
export const normalizedName = (name: string) => name.normalize("NFKC").trim().toLowerCase();
export function strings(value: unknown, label: string): string[] {
	if (
		!Array.isArray(value) ||
		!value.every((v) => typeof v === "string" && /^[a-z][a-z0-9-]*$/.test(v)) ||
		new Set(value).size !== value.length
	)
		throw new Error("Invalid " + label);
	return value;
}
export function candidates(text: string): Candidate[] {
	let headers: string[] = [];
	const rows = csv(text, {
		bom: true,
		skip_empty_lines: true,
		relax_quotes: true,
		columns: (input: string[]) => {
			headers = input.map((h) => h.trim().toLowerCase().replace(/[ _-]/g, ""));
			if (new Set(headers).size !== headers.length || !headers.includes("name"))
				throw new Error("CSV requires unique headers and name");
			return headers;
		},
	}) as Record<string, string>[];
	if (!rows.length) throw new Error("Candidate CSV is empty");
	return rows.map((r, i) => {
		if (!r.name?.trim()) throw new Error("Unnamed candidate at row " + (i + 2));
		const maybe = (r.maybeboard ?? "").trim().toLowerCase();
		if (!["", "false", "f", "no", "n", "0", "true", "t", "yes", "y", "1"].includes(maybe))
			throw new Error("Invalid maybeboard flag");
		return {
			id: "row-" + (i + 2),
			name: r.name.trim(),
			set: r.set?.trim().toLowerCase() || null,
			collectorNumber: r.collectornumber?.trim() || null,
			oracleId: r.oracleid?.trim() || null,
			board: r.board?.trim().toLowerCase() || "mainboard",
			maybeboard: ["true", "t", "yes", "y", "1"].includes(maybe),
		};
	});
}
export function parseAnnotations(text: string): Annotations {
	const v = requireObject(yaml(text, { maxAliasCount: 20 }), "Annotations");
	keys(v, ["schemaVersion", "archetypes", "cards", "targets"], "annotation");
	if (v.schemaVersion !== 1 || !Array.isArray(v.cards))
		throw new Error("Annotations require schemaVersion: 1 and cards");
	const archetypes = strings(v.archetypes, "archetypes");
	const targets = requireObject(v.targets ?? {}, "Targets");
	for (const [key, value] of Object.entries(targets))
		if (!ROLES.includes(key) || (value !== null && (!Number.isSafeInteger(value) || Number(value) < 0)))
			throw new Error("Invalid role target");
	const ids = new Set<string>();
	const cards = v.cards.map((raw) => {
		const a = requireObject(raw, "Card annotation");
		keys(
			a,
			["name", "cardId", "category", "roles", "tribes", "archetypes", "affinities", "evidence", "reviewNotes"],
			"card annotation"
		);
		if (
			(typeof a.name === "string" && a.name.trim() ? 1 : 0) +
				(typeof a.cardId === "string" && /^card-[a-f0-9]{64}$/.test(a.cardId) ? 1 : 0) !==
			1
		)
			throw new Error("Annotation needs exactly one name/cardId");
		const id = typeof a.name === "string" ? cardIdentity(a.name) : String(a.cardId);
		if (ids.has(id)) throw new Error("Duplicate annotation identity");
		ids.add(id);
		if (a.category !== undefined && !CATEGORIES.includes(a.category as SupplyCategory))
			throw new Error("Invalid supply category");
		for (const field of ["roles", "tribes", "archetypes"]) if (a[field] !== undefined) strings(a[field], field);
		if (Array.isArray(a.archetypes) && a.archetypes.some((x) => !archetypes.includes(String(x))))
			throw new Error("Unknown archetype membership");
		if (a.affinities !== undefined)
			for (const [key, value] of Object.entries(requireObject(a.affinities, "Affinities")))
				if (
					!archetypes.includes(key) ||
					typeof value !== "number" ||
					!Number.isFinite(value) ||
					value < 0 ||
					value > 1
				)
					throw new Error("Invalid affinity");
		for (const field of ["evidence", "reviewNotes"])
			if (a[field] !== undefined && typeof a[field] !== "string") throw new Error("Invalid annotation note");
		return structuredClone(a) as unknown as Annotation;
	});
	return {
		schemaVersion: 1,
		archetypes: [...archetypes].sort(),
		cards,
		targets: targets as Record<string, number | null>,
	};
}
export function readAnnotations(file?: string): Annotations {
	return file
		? parseAnnotations(fs.readFileSync(file, "utf8"))
		: { schemaVersion: 1, archetypes: [], cards: [], targets: {} };
}
export function verifyBundle(value: unknown): Bundle {
	const b = requireObject(value, "Bundle");
	keys(b, ["version", "capturedAt", "candidateCsv", "candidateHash", "sources", "errors", "hash"], "bundle");
	if (
		b.version !== VERSION ||
		typeof b.capturedAt !== "string" ||
		!Number.isFinite(Date.parse(b.capturedAt)) ||
		typeof b.candidateCsv !== "string" ||
		!Array.isArray(b.sources) ||
		!Array.isArray(b.errors) ||
		!b.errors.every((e) => typeof e === "string")
	)
		throw new Error("Invalid research bundle");
	if (bytesHash(Buffer.from(b.candidateCsv)) !== b.candidateHash) throw new Error("Candidate hash mismatch");
	candidates(b.candidateCsv);
	for (const raw of b.sources) {
		const source = requireObject(raw, "Source");
		keys(source, ["source", "capturedAt", "status", "body", "hash"], "source");
		if (
			typeof source.source !== "string" ||
			typeof source.capturedAt !== "string" ||
			!Number.isFinite(Date.parse(source.capturedAt)) ||
			!Number.isSafeInteger(source.status) ||
			typeof source.body !== "string" ||
			bytesHash(Buffer.from(source.body)) !== source.hash
		)
			throw new Error("Source hash/shape mismatch");
	}
	const { hash, ...payload } = b;
	if (hash !== digest(payload)) throw new Error("Research bundle seal mismatch");
	return structuredClone(b) as unknown as Bundle;
}
export function readBundle(file: string): Bundle {
	return verifyBundle(JSON.parse(fs.readFileSync(file, "utf8")));
}
function records(source: Source): Record<string, unknown>[] {
	if (source.status !== 200) return [];
	const raw: unknown = JSON.parse(source.body);
	const data = Array.isArray(raw) ? raw : object(raw) ? raw.data : null;
	if (!Array.isArray(data) || !data.every(object))
		throw new Error("Metadata must be a card array or collection data array");
	return data;
}
const colors = (raw: unknown, mana = false): string[] | null =>
	Array.isArray(raw) &&
	raw.every(
		(v) => typeof v === "string" && (mana ? ["W", "U", "B", "R", "G", "C"] : ["W", "U", "B", "R", "G"]).includes(v)
	) &&
	new Set(raw).size === raw.length
		? [...raw].sort()
		: null;
export function catalog(bundle: Bundle, annotations: Annotations): Catalog {
	verifyBundle(bundle);
	const metadata = [...new Map(bundle.sources.flatMap(records).map((m) => [digest(m), m])).values()];
	const annotationMap = new Map(annotations.cards.map((a) => [a.name ? cardIdentity(a.name) : a.cardId!, a]));
	const byCard = new Map<string, ResearchCard>();
	for (const row of candidates(bundle.candidateCsv)) {
		const id = cardIdentity(row.name);
		const card = byCard.get(id) ?? {
			id,
			name: row.name,
			rows: [],
			metadata: null,
			annotation: annotationMap.get(id) ?? null,
			issues: [],
		};
		card.rows.push(row);
		byCard.set(id, card);
		if (!!row.set !== !!row.collectorNumber) {
			card.issues.push(row.id + ": incomplete printing identifier");
			continue;
		}
		const matching = metadata.filter(
			(m) =>
				typeof m.name === "string" &&
				normalizedName(m.name) === normalizedName(row.name) &&
				(!row.set || (m.set === row.set && String(m.collector_number) === row.collectorNumber)) &&
				(!row.oracleId || m.oracle_id === row.oracleId)
		);
		if (matching.length !== 1) {
			card.issues.push(row.id + ": " + (matching.length ? "ambiguous metadata" : "unresolved exact identity"));
			continue;
		}
		const m = matching[0];
		const next: Metadata = {
			oracleId: typeof m.oracle_id === "string" && m.oracle_id ? m.oracle_id : null,
			printingIds:
				typeof m.id === "string" && m.id
					? [m.id]
					: typeof m.set === "string" && m.collector_number !== undefined
						? [m.set + "/" + String(m.collector_number)]
						: [],
			manaValue: typeof m.cmc === "number" && Number.isFinite(m.cmc) && m.cmc >= 0 ? m.cmc : null,
			colorIdentity: colors(m.color_identity),
			typeLine: typeof m.type_line === "string" && m.type_line ? m.type_line : null,
			producedMana: colors(m.produced_mana, true),
			oracleText:
				typeof m.oracle_text === "string"
					? m.oracle_text
					: Array.isArray(m.card_faces) &&
						  m.card_faces.length &&
						  m.card_faces.every((face) => object(face) && typeof face.oracle_text === "string")
						? m.card_faces.map((face) => String(face.name ?? "face") + ": " + face.oracle_text).join("\n")
						: null,
		};
		if (card.metadata) {
			const { printingIds: priorIds, ...prior } = card.metadata;
			const { printingIds: nextIds, ...semantic } = next;
			if (digest(prior) !== digest(semantic))
				card.issues.push(row.id + ": conflicting card metadata across printings");
			card.metadata.printingIds = [...new Set([...priorIds, ...nextIds])].sort();
		} else card.metadata = next;
	}
	for (const id of annotationMap.keys())
		if (!byCard.has(id)) throw new Error("Annotation references an unknown candidate: " + id);
	const cards = [...byCard.values()].sort((a, b) => a.id.localeCompare(b.id));
	return {
		version: VERSION,
		bundleHash: bundle.hash,
		annotationHash: digest(annotations),
		archetypes: annotations.archetypes,
		targets: annotations.targets,
		cards,
	};
}
