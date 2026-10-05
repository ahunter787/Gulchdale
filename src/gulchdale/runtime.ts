export type RuntimeMode = "legacy" | "shadow" | "orchestrated";
export function runtimeMode(value = process.env.GULCHDALE_RUNTIME_MODE ?? "legacy"): RuntimeMode {
	if (!["legacy", "shadow", "orchestrated"].includes(value)) throw new Error("Invalid GULCHDALE_RUNTIME_MODE");
	if (value === "orchestrated")
		throw new Error("Orchestrated runtime unavailable: adapter and vertical-slice gates have not passed");
	return value as RuntimeMode;
}
export async function shadowReport(
	read: () => Promise<unknown>,
	warn: (message: string) => void = console.warn
): Promise<unknown | null> {
	try {
		return await read();
	} catch {
		warn("Gulchdale shadow comparison unavailable; legacy drafting remains active.");
		return null;
	}
}
export function startShadowComparison(mode: RuntimeMode): void {
	if (mode !== "shadow") return;
	// Deliberately unawaited by server startup, and no Draftmancer state is changed.
	void shadowReport(async () => {
		const { applicationPool } = await import("./database.js");
		const { FoundationRepository } = await import("./repositories.js");
		const db = applicationPool();
		try {
			const { loadCommittedWorkspace } = await import("./import.js");
			const report = await new FoundationRepository(db).compareLegacy(loadCommittedWorkspace());
			console.info("Gulchdale shadow comparison: " + JSON.stringify(report));
			return report;
		} finally {
			await db.end();
		}
	});
}
