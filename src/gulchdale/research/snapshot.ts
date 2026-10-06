import { bytesHash, digest } from "../domain.js";
import { candidates, VERSION, object, type Bundle, type Source } from "./catalog.js";

export interface SnapshotIO {
	fetch: (url: string, options: RequestInit) => Promise<Response>;
	wait: (ms: number) => Promise<void>;
	now: () => string;
}
const defaultIO: SnapshotIO = {
	fetch: (url, options) => fetch(url, options),
	wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	now: () => new Date().toISOString(),
};
export class SnapshotFailure extends Error {
	constructor(
		message: string,
		readonly sources: Source[]
	) {
		super(message);
	}
}
export async function snapshot(
	candidateCsv: string,
	options: { metadata?: string; fetch?: boolean },
	io = defaultIO
): Promise<Bundle> {
	if (options.fetch && options.metadata !== undefined) throw new Error("Choose local metadata OR explicit fetch");
	const rows = candidates(candidateCsv),
		sources: Source[] = [],
		errors: string[] = [];
	const capturedAt = io.now();
	if (options.metadata !== undefined)
		sources.push({
			source: "local-metadata",
			capturedAt,
			status: 200,
			body: options.metadata,
			hash: bytesHash(Buffer.from(options.metadata)),
		});
	if (options.fetch) {
		const identifiers = [
			...new Map(
				rows
					.filter((row) => {
						if (!!row.set !== !!row.collectorNumber) {
							errors.push(row.id + ": incomplete printing identifier; not fetched");
							return false;
						}
						return true;
					})
					.map((row) => {
						const identifier = row.set
							? { set: row.set, collector_number: row.collectorNumber! }
							: row.oracleId
								? { oracle_id: row.oracleId }
								: { name: row.name };
						return [digest(identifier), identifier];
					})
			).values(),
		];
		let requests = 0;
		for (let offset = 0; offset < identifiers.length; offset += 75) {
			let success = false;
			for (let attempt = 0; attempt < 3; attempt++) {
				if (requests++) await io.wait(600);
				let response: Response;
				try {
					response = await io.fetch("https://api.scryfall.com/cards/collection", {
						method: "POST",
						signal: AbortSignal.timeout(20000),
						headers: {
							"Content-Type": "application/json",
							Accept: "application/json",
							"User-Agent": "Gulchdale-Research-Workbench/1.0 (https://github.com/ahunter787/Gulchdale)",
						},
						body: JSON.stringify({ identifiers: identifiers.slice(offset, offset + 75) }),
					});
				} catch {
					if (attempt === 2)
						throw new SnapshotFailure("Snapshot network failure; earlier snapshots are unchanged", sources);
					continue;
				}
				let body: string;
				try {
					body = await response.text();
				} catch {
					throw new SnapshotFailure(
						"Snapshot response interrupted; earlier snapshots are unchanged",
						sources
					);
				}
				sources.push({
					source: "scryfall-collection:" + offset + ":" + attempt,
					capturedAt: io.now(),
					status: response.status,
					body,
					hash: bytesHash(Buffer.from(body)),
				});
				if (response.status === 200) {
					let data: { data?: unknown; not_found?: unknown };
					try {
						data = JSON.parse(body);
					} catch {
						throw new SnapshotFailure("Invalid metadata JSON", sources);
					}
					if (!object(data) || !Array.isArray(data.data))
						throw new SnapshotFailure("Invalid collection response", sources);
					if (Array.isArray(data.not_found))
						errors.push(...data.not_found.map((v) => "Scryfall unresolved: " + JSON.stringify(v)));
					success = true;
					break;
				}
				if (response.status !== 429 && response.status < 500)
					throw new SnapshotFailure("Snapshot HTTP failure " + response.status, sources);
				const retry = response.headers.get("Retry-After");
				const delay = retry
					? /^\d+(\.\d+)?$/.test(retry)
						? Number(retry) * 1000
						: Math.max(0, Date.parse(retry) - Date.parse(io.now()))
					: 600;
				if (!Number.isFinite(delay) || delay > 60000)
					throw new SnapshotFailure("Retry later; source requests stopped", sources);
				if (attempt < 2) await io.wait(delay);
			}
			if (!success) throw new SnapshotFailure("Snapshot retries exhausted", sources);
		}
	}
	const payload = {
		version: VERSION,
		capturedAt,
		candidateCsv,
		candidateHash: bytesHash(Buffer.from(candidateCsv)),
		sources,
		errors,
	};
	return { ...payload, hash: digest(payload) };
}
