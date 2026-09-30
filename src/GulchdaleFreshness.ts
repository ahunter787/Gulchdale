import crypto from "crypto";

export type GulchdaleUpdateState = "checking" | "current" | "update_available" | "unreachable" | "disabled";

export type GulchdaleCompilerStatus = {
	activeVersion: string;
	environmentHash: string;
	activeSourceHash: string;
	state: GulchdaleUpdateState;
	lastSuccessfulCheckAt: string | null;
};

export const GULCHDALE_CSV_URL = "https://cubecobra.com/cube/download/csv/f1c8be0f-7ac3-420f-81eb-ec8933ce45fa";
export const GULCHDALE_UPDATE_CHECK_TIMEOUT_MS = 10_000;

type Manifest = {
	version: string;
	environmentSha256: string;
	cube: { sourceSha256: string };
};

export function updateCheckIntervalSeconds(value = process.env.GULCHDALE_UPDATE_CHECK_INTERVAL_SECONDS): number {
	if (value === undefined || value === "") return 6 * 60 * 60;
	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds < 0) {
		throw new Error("GULCHDALE_UPDATE_CHECK_INTERVAL_SECONDS must be a non-negative number.");
	}
	return seconds;
}

export class GulchdaleFreshnessMonitor {
	private checking = false;
	private status: GulchdaleCompilerStatus;

	constructor(
		manifest: Manifest,
		private readonly intervalSeconds = updateCheckIntervalSeconds(),
		private readonly fetcher: typeof fetch = fetch
	) {
		this.status = {
			activeVersion: manifest.version,
			environmentHash: manifest.environmentSha256,
			activeSourceHash: manifest.cube.sourceSha256,
			state: intervalSeconds === 0 ? "disabled" : "checking",
			lastSuccessfulCheckAt: null,
		};
	}

	snapshot(): GulchdaleCompilerStatus {
		return { ...this.status };
	}

	async check(): Promise<GulchdaleCompilerStatus> {
		if (this.intervalSeconds === 0) return this.snapshot();
		if (this.checking) return this.snapshot();
		this.checking = true;
		this.status.state = "checking";
		try {
			const response = await this.fetcher(GULCHDALE_CSV_URL, {
				headers: { "User-Agent": "Gulchdale/2 compiler-freshness-monitor" },
				signal: AbortSignal.timeout(GULCHDALE_UPDATE_CHECK_TIMEOUT_MS),
			});
			if (!response.ok) throw new Error(`CubeCobra returned HTTP ${response.status}.`);
			const source = Buffer.from(await response.arrayBuffer());
			if (!source.toString("utf8", 0, 5).startsWith("name,")) throw new Error("CubeCobra did not return CSV.");
			const remoteHash = crypto.createHash("sha256").update(source).digest("hex");
			this.status.lastSuccessfulCheckAt = new Date().toISOString();
			this.status.state = remoteHash === this.status.activeSourceHash ? "current" : "update_available";
		} catch (error) {
			this.status.state = "unreachable";
			console.warn(`Gulchdale freshness check failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.checking = false;
		}
		return this.snapshot();
	}

	start(): void {
		if (this.intervalSeconds === 0) return;
		setTimeout(() => void this.check(), 1_000).unref();
		setInterval(() => void this.check(), this.intervalSeconds * 1_000).unref();
	}
}
