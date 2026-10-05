import fs from "node:fs";
import path from "node:path";
import { parse as csv } from "csv-parse/sync";
import { parse as yaml } from "yaml";
import {
	bytesHash,
	cardIdentity,
	digest,
	type Data,
	type Workspace,
	type SourceSnapshot,
	type CardRecord,
	type PrintingRecord,
} from "./domain.js";

interface Config {
	schema_version: number;
	cube: { id: string };
	tags: { sheets: Record<string, string>; draft_effect: string; spawned: string };
	settings: Data;
	profile: Data;
	tribes: Record<string, Data>;
	static_custom_cards: string;
}
interface Manifest {
	cube: { id: string; sourceSha256: string };
	environmentSha256: string;
	scryfallSha256: string;
	configSha256: string;
	version: string;
	counts: {
		sourceRows: number;
		customCards: number;
		draftEffectCards: number;
		sheets: Record<string, number>;
		warnings: number;
	};
	warnings: string[];
}
const truthy = (s: string) => ["true", "t", "yes", "y", "1"].includes(s?.trim().toLowerCase());
export function loadCommittedWorkspace(root = process.cwd()): Workspace {
	const inputs = [
		["cube-cobra", "data/compiler/source/gulchdale.csv"],
		["scryfall", "data/compiler/source/scryfall.json"],
		["compiler-config", "compiler/config/gulchdale.yml"],
		["custom-config", "compiler/config/static_custom_cards.yml"],
		["manifest", "data/cubes/gulchdale.manifest.json"],
		["legacy-environment", "data/cubes/gulchdale.txt"],
	];
	const sources: SourceSnapshot[] = inputs.map(([kind, p]) => {
		const bytes = fs.readFileSync(path.join(root, p));
		return { id: bytesHash(bytes), kind, path: p, bytes };
	});
	const text = (kind: string) => sources.find((s) => s.kind === kind)!.bytes.toString("utf8");
	const manifest = JSON.parse(text("manifest")) as Manifest;
	const config = yaml(text("compiler-config")) as Config;
	const cache = JSON.parse(text("scryfall")) as Record<string, Data>;
	const custom = yaml(text("custom-config")) as (Data & { name: string; include_in?: string[] })[];
	if (
		config.schema_version !== 1 ||
		config.static_custom_cards !== "static_custom_cards.yml" ||
		config.cube.id !== manifest.cube.id
	)
		throw new Error("Unsupported/mismatched compiler configuration");
	const configHash = bytesHash(
		Buffer.concat([
			sources.find((s) => s.kind === "compiler-config")!.bytes,
			Buffer.from([0]),
			sources.find((s) => s.kind === "custom-config")!.bytes,
		])
	);
	if (configHash !== manifest.configSha256)
		throw new Error("Combined compiler/static config hash differs from manifest");
	for (const [kind, expected] of [
		["cube-cobra", manifest.cube.sourceSha256],
		["scryfall", manifest.scryfallSha256],
		["legacy-environment", manifest.environmentSha256],
	]) {
		if (sources.find((s) => s.kind === kind)!.id !== expected)
			throw new Error(kind + " hash differs from manifest");
	}
	// Historical Cube Cobra Notes contain unescaped internal quotes. Retain exact
	// snapshot bytes; tolerate quotes only, never column-count/reference errors.
	const rows = csv(text("cube-cobra"), {
		columns: true,
		bom: true,
		skip_empty_lines: true,
		relax_quotes: true,
	}) as Record<string, string>[];
	if (!rows.length || !["name", "Set", "Collector Number", "tags", "Notes"].every((k) => k in rows[0]))
		throw new Error("CSV required columns missing");
	const active = rows.filter((r) => {
		if (!r.name?.trim()) throw new Error("CSV has unnamed card");
		const board = (r.board || "mainboard").trim().toLowerCase();
		if (truthy(r.maybeboard) && board === "mainboard") throw new Error("Conflicting maybeboard");
		return !truthy(r.maybeboard) && ["", "mainboard"].includes(board);
	});
	const cards = new Map<string, CardRecord>(),
		printings = new Map<string, PrintingRecord>();
	const pool: Workspace["pool"] = [];
	const commanders: Workspace["commanders"] = [];
	for (const [i, r] of active.entries()) {
		const name = r.name.trim(),
			cardId = cardIdentity(name),
			set = r.Set.trim().toLowerCase(),
			collectorNumber = r["Collector Number"].trim(),
			printingId = set + "/" + collectorNumber;
		const m = cache[printingId];
		if (
			!m ||
			String(m.name).toLowerCase() !== name.toLowerCase() ||
			m.set !== set ||
			String(m.collector_number) !== collectorNumber
		)
			throw new Error("Missing/mismatched printing " + printingId);
		const tags = r.tags
			.split(";")
			.map((t) => t.trim())
			.filter(Boolean);
		const sheets = Object.entries(config.tags.sheets)
			.filter(([, t]) => tags.some((v) => v.toLowerCase() === t.toLowerCase()))
			.map(([s]) => s)
			.sort();
		cards.set(cardId, {
			id: cardId,
			name,
			data: {
				color: r.Color || "",
				type: r.Type || "",
				cmc: r.CMC,
				notes: r.Notes.split(/\r?\n/)
					.map((n) => n.trim())
					.filter(Boolean),
				tags: [...new Set([...((cards.get(cardId)?.data.tags as string[]) ?? []), ...tags])].sort(),
				difficulty: null,
				worldTags: [],
				importedAffinities: {},
			},
		});
		if (printings.has(printingId) && printings.get(printingId)!.cardId !== cardId)
			throw new Error("Printing identity collision");
		printings.set(printingId, { id: printingId, cardId, set, collectorNumber, data: m });
		pool.push({
			id: "source-" + i,
			cardId,
			printingId,
			quantity: 1,
			sheets,
			tags,
			data: { origin: "cube-cobra", sourceRow: i + 2, board: "mainboard" },
		});
		if (sheets.includes("commander")) commanders.push({ cardId, data: { origin: "legacy", printingId } });
	}
	for (const [i, c] of custom.entries()) {
		const cardId = cardIdentity(c.name);
		if (cards.has(cardId)) throw new Error("Static custom name collides with imported card");
		cards.set(cardId, {
			id: cardId,
			name: c.name,
			data: { ...c, kind: "custom-object", difficulty: null, worldTags: [], importedAffinities: {} },
		});
		const sheets = c.include_in ?? [];
		if (sheets.some((s) => !(s in config.tags.sheets))) throw new Error("Unknown custom sheet");
		pool.push({
			id: "custom-" + i,
			cardId,
			printingId: null,
			quantity: 1,
			sheets,
			tags: [],
			data: { origin: "custom-config" },
		});
	}
	const sheets = Object.fromEntries(
		Object.keys(config.tags.sheets).map((s) => [
			s,
			pool.filter((p) => p.sheets.includes(s)).reduce((n, p) => n + p.quantity, 0),
		])
	);
	const effects = new Set(
		active
			.filter((r) =>
				r.tags.split(";").some((t) => t.trim().toLowerCase() === config.tags.draft_effect.toLowerCase())
			)
			.map((r) => cardIdentity(r.name))
	);
	const counts = {
		sourceRows: active.length,
		sheets,
		customCards: custom.length + effects.size,
		draftEffectCards: effects.size,
		warnings: manifest.warnings.length,
	};
	if (digest(counts) !== digest(manifest.counts))
		throw new Error("Import counts do not reconcile with manifest: " + JSON.stringify(counts));
	// Independently reconcile the compiled artifact as evidence, not the domain source.
	const artifact = text("legacy-environment");
	const customSection = artifact.split("[CustomCards]\n")[1]?.split("\n[commander]")[0];
	if (!customSection || JSON.parse(customSection).length !== counts.customCards)
		throw new Error("Legacy custom count mismatch");
	for (const [sheet, n] of Object.entries(sheets)) {
		const section = artifact.split("[" + sheet + "]\n")[1]?.split(/\n\[[a-z]+\]/)[0];
		if (!section || section.trim().split("\n").filter(Boolean).length !== n)
			throw new Error("Legacy sheet mismatch: " + sheet);
	}
	const provenance = {
		cubeId: manifest.cube.id,
		legacyVersion: manifest.version,
		environmentSha256: manifest.environmentSha256,
		engineRevision: "11f056cc1be6f99795f89d8dc7111d98f1a83c6a",
		engineIdentity: {
			upstreamRevision: "11f056cc1be6f99795f89d8dc7111d98f1a83c6a",
			legacyBaselineCommit: "e766438c617711a22f3ec6899f4155cb0f6fb040",
			compatibilityPatch: "unavailable-lobby-player-preflight-v1",
		},
		sourceHashes: Object.fromEntries(sources.map((s) => [s.kind, s.id])),
	};
	const id = digest({ importerVersion: 1, provenance });
	return {
		id,
		sources,
		cards: [...cards.values()].sort((a, b) => a.id.localeCompare(b.id)),
		printings: [...printings.values()].sort((a, b) => a.id.localeCompare(b.id)),
		pool,
		commanders,
		personalInjections: [],
		supplyPolicies: [
			{
				id: "legacy-snapshot",
				kind: "imported-quantity",
				playerCountScaling: null,
				status: "preserve-only; GD-300-901 required for virtual scaling",
			},
		],
		archetypes: [],
		tribes: Object.entries(config.tribes)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([id, data]) => ({ id, data })),
		worldTags: [],
		affinities: [],
		counts,
		provenance,
		rules: {
			scope: "legacy-reproduction",
			settings: config.settings,
			profile: config.profile,
			overhaulDefaults: {
				deckSize: 60,
				life: 30,
				retainedCommanders: 4,
				markedLeaders: 1,
				singleton: "per-player final deck",
				colorExpansion: "Adornment",
				privatePack: "ChoicePack",
			},
			ownerDecisionGates: ["GD-300-901", "GD-400-901", "GD-500-901"],
		},
	};
}
export function workspacePayload(w: Workspace): Data {
	const { sources, ...payload } = w;
	return { ...payload, sources: sources.map(({ bytes, ...s }) => s) };
}
export function validateWorkspace(w: Workspace): void {
	const ids = new Set(w.cards.map((c) => c.id)),
		prints = new Set(w.printings.map((p) => p.id));
	if (!w.cards.length || !w.pool.length) throw new Error("Empty workspace");
	for (const p of w.pool)
		if (
			!ids.has(p.cardId) ||
			(p.printingId && !prints.has(p.printingId)) ||
			!Number.isInteger(p.quantity) ||
			p.quantity < 1
		)
			throw new Error("Invalid pool reference/quantity");
	for (const p of w.printings) if (!ids.has(p.cardId)) throw new Error("Printing references unknown card");
	const archetypes = new Set(w.archetypes.map((a) => a.id));
	for (const a of w.affinities)
		if (
			!ids.has(a.cardId) ||
			!archetypes.has(a.archetypeId) ||
			!Number.isFinite(a.score) ||
			a.score < 0 ||
			a.score > 1
		)
			throw new Error("Invalid sparse affinity");
	for (const a of w.archetypes)
		if (a.capacity !== null && (!Number.isFinite(a.capacity) || a.capacity < 0))
			throw new Error("Invalid archetype capacity");
	for (const p of [...w.commanders, ...w.personalInjections])
		if (!ids.has(p.cardId)) throw new Error("Invalid commander/injection reference");
	if (
		ids.size !== w.cards.length ||
		prints.size !== w.printings.length ||
		new Set(w.pool.map((p) => p.id)).size !== w.pool.length
	)
		throw new Error("Duplicate domain identity");
	for (const s of w.sources) if (s.id !== bytesHash(s.bytes)) throw new Error("Corrupt source snapshot");
}
