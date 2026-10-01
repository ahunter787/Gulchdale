export type GulchdaleUpdateState = "checking" | "current" | "update_available" | "unreachable" | "disabled";

export type GulchdaleCompilerStatus = {
	activeVersion: string;
	environmentHash: string;
	activeSourceHash: string;
	state: GulchdaleUpdateState;
	lastSuccessfulCheckAt: string | null;
};
