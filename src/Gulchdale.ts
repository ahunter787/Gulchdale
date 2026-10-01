import crypto from "crypto";
import fs from "fs";

import type { CustomCardList } from "./CustomCardList.js";
import { isSocketError } from "./Message.js";
import { parseCardList } from "./parseCardList.js";
import type { Session } from "./Session.js";

export const GULCHDALE_APP_NAME = "Gulchdale";
export const GULCHDALE_CUBE_NAME = "Gulchdale";
export const GULCHDALE_CUBE_ID = "f1c8be0f-7ac3-420f-81eb-ec8933ce45fa";
export const GULCHDALE_ENVIRONMENT_FILE = "data/cubes/gulchdale.txt";
export const GULCHDALE_MANIFEST_FILE = "data/cubes/gulchdale.manifest.json";
export const GULCHDALE_UPSTREAM_REVISION = "11f056cc1be6f99795f89d8dc7111d98f1a83c6a";
export const GULCHDALE_MAX_PLAYERS = 8;
export const GULCHDALE_DEFAULT_TIMER = 0;
export const GULCHDALE_DEFAULT_PROFILE_ID = "classic";

export type EnvironmentStage = Readonly<{ layout: string; label: string }>;
export type EnvironmentProfile = {
	id: string;
	displayName: string;
	cubeCobraID: string;
	version: string;
	environmentHash: string;
	sourceHash: string;
	maxPlayers: number;
	defaultTimer: number;
	locked: true;
	reportingEnabled: false;
	stages: readonly EnvironmentStage[];
	branding: Readonly<{
		logo: string;
		cardBack: string;
		backdrop: string;
		lobbyBackdrop: string;
		travelerSilhouettes: readonly string[];
	}>;
};

let environmentSource: string;
try {
	environmentSource = fs.readFileSync(GULCHDALE_ENVIRONMENT_FILE, "utf8");
} catch (error) {
	throw new Error(
		`Unable to start ${GULCHDALE_APP_NAME}: cannot read the bundled environment at ${GULCHDALE_ENVIRONMENT_FILE}. Restore the committed snapshot and rebuild the application.`,
		{ cause: error }
	);
}
export const GULCHDALE_ENVIRONMENT_HASH = crypto.createHash("sha256").update(environmentSource).digest("hex");

type GulchdaleManifest = {
	version: string;
	environmentSha256: string;
	cube: { id?: string; sourceSha256: string };
	counts: { sheets: Record<string, number> };
	environmentProfile?: {
		id?: string;
		displayName?: string;
		stages?: EnvironmentStage[];
		branding?: Partial<EnvironmentProfile["branding"]>;
	};
};

let manifest: GulchdaleManifest;
try {
	manifest = JSON.parse(fs.readFileSync(GULCHDALE_MANIFEST_FILE, "utf8")) as GulchdaleManifest;
} catch (error) {
	throw new Error(`Unable to start ${GULCHDALE_APP_NAME}: cannot read ${GULCHDALE_MANIFEST_FILE}.`, { cause: error });
}
if (manifest.environmentSha256 !== GULCHDALE_ENVIRONMENT_HASH) {
	throw new Error(
		`Unable to start ${GULCHDALE_APP_NAME}: environment hash does not match ${GULCHDALE_MANIFEST_FILE}. Recompile and promote the environment together.`
	);
}
export const GULCHDALE_MANIFEST = Object.freeze(manifest);

const profileManifest = manifest.environmentProfile;
const profileStages = Object.freeze((profileManifest?.stages ?? []).map((stage) => Object.freeze({ ...stage })));
const profileBranding = Object.freeze({
	logo: profileManifest?.branding?.logo ?? "/img/gulchdale-logo.png",
	cardBack: profileManifest?.branding?.cardBack ?? "/img/gulchdale-card-back.png",
	backdrop: profileManifest?.branding?.backdrop ?? "/img/gulchdale-landing.jpg",
	lobbyBackdrop: profileManifest?.branding?.lobbyBackdrop ?? "/img/gulchdale-landing.jpg",
	travelerSilhouettes: Object.freeze(profileManifest?.branding?.travelerSilhouettes ?? []),
});
export const GULCHDALE_ENVIRONMENT_PROFILE: EnvironmentProfile = Object.freeze({
	id: profileManifest?.id ?? GULCHDALE_DEFAULT_PROFILE_ID,
	displayName: profileManifest?.displayName ?? GULCHDALE_CUBE_NAME,
	cubeCobraID: manifest.cube.id ?? GULCHDALE_CUBE_ID,
	version: manifest.version,
	environmentHash: GULCHDALE_ENVIRONMENT_HASH,
	sourceHash: manifest.cube.sourceSha256,
	maxPlayers: GULCHDALE_MAX_PLAYERS,
	defaultTimer: GULCHDALE_DEFAULT_TIMER,
	locked: true,
	reportingEnabled: false,
	stages: profileStages,
	branding: profileBranding,
});

const parsedEnvironment = parseCardList(environmentSource, {
	name: GULCHDALE_CUBE_NAME,
	cubeCobraID: GULCHDALE_CUBE_ID,
});

if (isSocketError(parsedEnvironment)) {
	throw new Error(
		`Unable to start ${GULCHDALE_APP_NAME}: ${GULCHDALE_ENVIRONMENT_FILE} is invalid: ${parsedEnvironment.error?.title ?? "Unknown parsing error"} ${parsedEnvironment.error?.text ?? ""}`
	);
}

const canonicalEnvironment: CustomCardList = parsedEnvironment;

export type GulchdalePublicConfig = {
	app: typeof GULCHDALE_APP_NAME;
	cubeName: typeof GULCHDALE_CUBE_NAME;
	cubeCobraID: typeof GULCHDALE_CUBE_ID;
	defaultTimer: typeof GULCHDALE_DEFAULT_TIMER;
	environmentHash: string;
	activeVersion: string;
	locked: true;
	maxPlayers: typeof GULCHDALE_MAX_PLAYERS;
	reportingEnabled: false;
	upstreamRevision: typeof GULCHDALE_UPSTREAM_REVISION;
	environment: EnvironmentProfile;
};

export const GulchdalePublicConfig: GulchdalePublicConfig = Object.freeze({
	app: GULCHDALE_APP_NAME,
	cubeName: GULCHDALE_CUBE_NAME,
	cubeCobraID: GULCHDALE_CUBE_ID,
	defaultTimer: GULCHDALE_DEFAULT_TIMER,
	environmentHash: GULCHDALE_ENVIRONMENT_HASH,
	activeVersion: GULCHDALE_MANIFEST.version,
	locked: true,
	maxPlayers: GULCHDALE_MAX_PLAYERS,
	reportingEnabled: false,
	upstreamRevision: GULCHDALE_UPSTREAM_REVISION,
	environment: GULCHDALE_ENVIRONMENT_PROFILE,
});

export function cloneGulchdaleEnvironment(): CustomCardList {
	const environment = structuredClone(canonicalEnvironment);
	environment.name = GULCHDALE_CUBE_NAME;
	environment.cubeCobraID = GULCHDALE_CUBE_ID;
	environment.settings ??= { refillWhenEmpty: false };
	environment.settings.cardBack = GULCHDALE_ENVIRONMENT_PROFILE.branding.cardBack;
	return environment;
}

export function applyGulchdaleEnvironment(session: Session): void {
	session.setCustomCardList(cloneGulchdaleEnvironment());
	session.environmentProfileID = GULCHDALE_ENVIRONMENT_PROFILE.id;
	session.environmentVersion = GULCHDALE_ENVIRONMENT_PROFILE.version;
	session.environmentLocked = true;
	session.maxPlayers = GULCHDALE_MAX_PLAYERS;
	session.maxTimer = GULCHDALE_DEFAULT_TIMER;
	session.bots = 0;
	session.sendResultsToCubeCobra = false;
}

export function isGulchdaleSession(session: Session | undefined): boolean {
	return (
		!!session &&
		session.useCustomCardList &&
		(session.environmentProfileID === GULCHDALE_ENVIRONMENT_PROFILE.id ||
			(session.customCardList?.name === GULCHDALE_CUBE_NAME &&
				session.customCardList?.cubeCobraID === GULCHDALE_CUBE_ID))
	);
}

export function migrateGulchdaleSessionIdentity(session: Session): void {
	if (!isGulchdaleSession(session)) return;
	session.environmentProfileID ??= GULCHDALE_DEFAULT_PROFILE_ID;
	session.environmentVersion ??= GULCHDALE_MANIFEST.version;
	session.environmentLocked = true;
}
