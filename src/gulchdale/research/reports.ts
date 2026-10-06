import { digest } from "../domain.js";
import { valueDiff } from "../diff.js";
import { loadCommittedWorkspace } from "../import.js";
import { tribalCapacity } from "../supply.js";
import { researchEngineIdentity } from "./experiments.js";
import { ROLES, VERSION, type Catalog, type ResearchCard } from "./catalog.js";

export function coverage<T>(cards: ResearchCard[], observe: (c: ResearchCard) => T[] | null, label: (v: T) => string) {
	const counts = new Map<string, number>();
	let known = 0;
	for (const c of cards) {
		const values = observe(c);
		if (values === null) continue;
		known++;
		for (const value of [...new Set(values.map(label))]) counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return {
		total: cards.length,
		known,
		unknown: cards.length - known,
		counts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
	};
}
export function report(c: Catalog, legacy = false) {
	const roles = coverage(c.cards, (c) => c.annotation?.roles ?? null, String);
	const targets = Object.fromEntries(
		ROLES.map((role) => [
			role,
			{ observed: roles.counts[role] ?? 0, target: c.targets[role] ?? "not specified", unknown: roles.unknown },
		])
	);
	const result = {
		version: VERSION,
		engineHash: researchEngineIdentity(),
		researchOnly: true,
		balanceApproved: false,
		bundleHash: c.bundleHash,
		annotationHash: c.annotationHash,
		logicalCards: c.cards.length,
		rows: c.cards.reduce((n, c) => n + c.rows.length, 0),
		boards: Object.fromEntries(
			[...new Set(c.cards.flatMap((c) => c.rows.map((r) => (r.maybeboard ? "maybeboard" : r.board))))]
				.sort()
				.map((board) => [
					board,
					c.cards.flatMap((c) => c.rows).filter((r) => (r.maybeboard ? "maybeboard" : r.board) === board)
						.length,
				])
		),
		manaCurve: coverage(
			c.cards,
			(c) =>
				c.metadata?.manaValue === null || c.metadata?.manaValue === undefined ? null : [c.metadata.manaValue],
			String
		),
		colorIdentity: coverage(
			c.cards,
			(c) => (c.metadata?.colorIdentity ? [c.metadata.colorIdentity.join("") || "colorless"] : null),
			String
		),
		cardTypes: coverage(c.cards, (c) => (c.metadata?.typeLine ? [c.metadata.typeLine] : null), String),
		manaProduction: coverage(c.cards, (c) => c.metadata?.producedMana ?? null, String),
		roles,
		targets,
		tribes: coverage(c.cards, (c) => c.annotation?.tribes ?? null, String),
		archetypes: coverage(c.cards, (c) => c.annotation?.archetypes ?? null, String),
		supplyCategories: coverage(c.cards, (c) => (c.annotation?.category ? [c.annotation.category] : null), String),
		supply: c.cards.map((card) => ({
			cardId: card.id,
			category: card.annotation?.category ?? "unclassified",
			perSessionCopies: card.annotation?.category
				? {
						four:
							card.annotation.category === "tribal"
								? tribalCapacity(4)
								: card.annotation.category === "commander-staple"
									? 4
									: 1,
						eight:
							card.annotation.category === "tribal"
								? tribalCapacity(8)
								: card.annotation.category === "commander-staple"
									? 8
									: 1,
					}
				: null,
			personal: card.annotation?.category === "commander-staple",
		})),
		issues: c.cards.flatMap((card) => [
			...card.issues.map((issue) => ({ cardId: card.id, name: card.name, issue })),
			...(!card.annotation?.category ? [{ cardId: card.id, name: card.name, issue: "unclassified supply" }] : []),
			...(!card.metadata?.colorIdentity
				? [{ cardId: card.id, name: card.name, issue: "unknown color identity" }]
				: []),
			...(card.metadata?.manaValue === null || !card.metadata
				? [{ cardId: card.id, name: card.name, issue: "unknown mana value" }]
				: []),
			...(!card.metadata?.oracleId
				? [{ cardId: card.id, name: card.name, issue: "unknown Oracle identity" }]
				: []),
			...(!card.metadata?.typeLine ? [{ cardId: card.id, name: card.name, issue: "unknown type line" }] : []),
			...(card.metadata?.oracleText === null || !card.metadata
				? [{ cardId: card.id, name: card.name, issue: "unknown Oracle text" }]
				: []),
		]),
		cards: c.cards,
		limitations: [
			"Declared support is not measured power or real-player behavior.",
			"Mana production is observed metadata, not a claim about unconditional or reliable fixing.",
			"Printed type lines do not automatically assign tribe, role or archetype membership.",
			"Unknown metadata and unset targets are not zeros or approvals.",
			"No price optimization, narrative implementation, deck legality or live release promotion.",
		],
		legacyReference: legacy ? legacyReference(c) : null,
	};
	return { ...result, reportHash: digest(result) };
}
function legacyReference(c: Catalog) {
	const legacy = loadCommittedWorkspace();
	const old = new Set(legacy.cards.map((c) => c.id)),
		next = new Set(c.cards.map((c) => c.id));
	return {
		workspace: legacy.id,
		sourceHashes: legacy.sources.map((s) => s.id),
		overlapping: [...next].filter((id) => old.has(id)).sort(),
		onlyCandidates: [...next].filter((id) => !old.has(id)).sort(),
		onlyLegacy: [...old].filter((id) => !next.has(id)).sort(),
		note: "Read-only membership comparison; no inherited tags, effects, metadata or rules.",
	};
}
export function compare(before: Catalog, after: Catalog) {
	const result = {
		version: VERSION,
		engineHash: researchEngineIdentity(),
		researchOnly: true,
		before: { bundle: before.bundleHash, annotations: before.annotationHash },
		after: { bundle: after.bundleHash, annotations: after.annotationHash },
		metadata: valueDiff(
			before.cards.map((c) => ({ id: c.id, name: c.name, metadata: c.metadata, rows: c.rows, issues: c.issues })),
			after.cards.map((c) => ({ id: c.id, name: c.name, metadata: c.metadata, rows: c.rows, issues: c.issues }))
		),
		annotations: valueDiff(
			{
				cards: before.cards.map((c) => ({ id: c.id, annotation: c.annotation })),
				archetypes: before.archetypes,
				targets: before.targets,
			},
			{
				cards: after.cards.map((c) => ({ id: c.id, annotation: c.annotation })),
				archetypes: after.archetypes,
				targets: after.targets,
			}
		),
	};
	return { ...result, reportHash: digest(result) };
}
export const escapeMarkdown = (text: string) => text.replace(/[\\`*_[\]<>#|]/g, "\\$&").replace(/[\r\n]+/g, " ");
export function markdown(value: unknown): string {
	const v = value as ReturnType<typeof report>;
	if (!("logicalCards" in v))
		return (
			"# Gulchdale research comparison\n\nResearch only; no live changes.\n\n```json\n" +
			JSON.stringify(value, null, 2) +
			"\n```\n"
		);
	const lines = [
		"# Gulchdale candidate research report",
		"",
		"Research only. Real balance and gameplay are not approved.",
		"",
		`Logical cards: ${v.logicalCards}; source rows: ${v.rows}.`,
		"",
		`Report hash: \`${v.reportHash}\`.`,
		"",
	];
	lines.push(
		"## Source boards",
		"",
		...Object.entries(v.boards).map(
			([board, count]) => "- " + escapeMarkdown(board) + ": " + count + " source rows"
		),
		""
	);
	for (const key of [
		"manaCurve",
		"colorIdentity",
		"cardTypes",
		"manaProduction",
		"roles",
		"tribes",
		"archetypes",
		"supplyCategories",
	] as const) {
		const s = v[key];
		lines.push(
			"## " + key,
			"",
			`Total ${s.total}; known ${s.known}; unknown ${s.unknown}.`,
			"",
			...Object.entries(s.counts).map(([name, count]) => "- " + escapeMarkdown(name) + ": " + count),
			""
		);
	}
	lines.push(
		"## Role targets",
		"",
		...Object.entries(v.targets).map(
			([role, item]) => `- ${role}: observed ${item.observed}; target ${item.target}; unknown ${item.unknown}.`
		),
		"",
		"## Candidates",
		""
	);
	for (const c of v.cards)
		lines.push(
			`- ${escapeMarkdown(c.name)} (${c.id}): ${c.annotation?.category ?? "unclassified"}; ${c.rows.map((r) => (r.maybeboard ? "maybeboard" : escapeMarkdown(r.board))).join(", ")}.`,
			...(c.annotation?.evidence ? ["  Evidence: " + escapeMarkdown(c.annotation.evidence)] : []),
			...(c.annotation?.reviewNotes ? ["  Review: " + escapeMarkdown(c.annotation.reviewNotes)] : [])
		);
	lines.push(
		"",
		"## Data quality",
		"",
		...v.issues.map((i) => "- " + escapeMarkdown(i.name + ": " + i.issue)),
		"",
		"## Interpretation limits",
		"",
		...v.limitations.map((s) => "- " + s),
		"",
		"## Optional legacy reference",
		"",
		v.legacyReference
			? "Explicit membership comparison only.\n\n```json\n" + JSON.stringify(v.legacyReference, null, 2) + "\n```"
			: "Not requested; no legacy inputs were read.",
		""
	);
	return lines.join("\n");
}
