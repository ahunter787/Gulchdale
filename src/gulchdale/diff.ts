import { digest, type Data } from "./domain.js";

// Review values, not only hashes. Keyed records remain readable on large pools.
export function valueDiff(before: unknown, after: unknown): unknown {
	if (digest(before) === digest(after)) return null;
	if (
		Array.isArray(before) &&
		Array.isArray(after) &&
		[...before, ...after].every((v) => v && typeof v === "object" && typeof v.id === "string")
	) {
		const old = new Map(before.map((v) => [v.id, v])),
			next = new Map(after.map((v) => [v.id, v]));
		const added = [...next.keys()].filter((id) => !old.has(id)).sort();
		const removed = [...old.keys()].filter((id) => !next.has(id)).sort();
		const changed = [...next.keys()]
			.filter((id) => old.has(id) && digest(old.get(id)) !== digest(next.get(id)))
			.sort()
			.map((id) => ({ id, changes: valueDiff(old.get(id), next.get(id)) }));
		return { added, removed, changed };
	}
	if (
		before &&
		after &&
		typeof before === "object" &&
		typeof after === "object" &&
		!Array.isArray(before) &&
		!Array.isArray(after)
	) {
		const a = before as Data,
			b = after as Data,
			changes: Data = {};
		for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
			const change = valueDiff(a[key], b[key]);
			if (change !== null) changes[key] = change;
		}
		return changes;
	}
	return { before: before ?? null, after: after ?? null };
}
