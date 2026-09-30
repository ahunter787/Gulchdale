export type GulchdaleUpdateState = "checking" | "current" | "update_available" | "unreachable" | "disabled";

export type GulchdaleCompilerStatus = {
	activeVersion: string;
	environmentHash: string;
	activeSourceHash: string;
	state: GulchdaleUpdateState;
	lastSuccessfulCheckAt: string | null;
};

export function shouldShowGulchdaleUpdateBanner(
	userID: string | undefined,
	sessionOwner: string | undefined,
	state: GulchdaleUpdateState
): boolean {
	return userID !== undefined && userID === sessionOwner && state === "update_available";
}
