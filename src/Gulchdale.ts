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
export const GULCHDALE_UPSTREAM_REVISION = "11f056cc1be6f99795f89d8dc7111d98f1a83c6a";
export const GULCHDALE_MAX_PLAYERS = 8;
export const GULCHDALE_DEFAULT_TIMER = 0;

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
	locked: true;
	maxPlayers: typeof GULCHDALE_MAX_PLAYERS;
	reportingEnabled: false;
	upstreamRevision: typeof GULCHDALE_UPSTREAM_REVISION;
};

export const GulchdalePublicConfig: GulchdalePublicConfig = Object.freeze({
	app: GULCHDALE_APP_NAME,
	cubeName: GULCHDALE_CUBE_NAME,
	cubeCobraID: GULCHDALE_CUBE_ID,
	defaultTimer: GULCHDALE_DEFAULT_TIMER,
	environmentHash: GULCHDALE_ENVIRONMENT_HASH,
	locked: true,
	maxPlayers: GULCHDALE_MAX_PLAYERS,
	reportingEnabled: false,
	upstreamRevision: GULCHDALE_UPSTREAM_REVISION,
});

export function cloneGulchdaleEnvironment(): CustomCardList {
	const environment = structuredClone(canonicalEnvironment);
	environment.name = GULCHDALE_CUBE_NAME;
	environment.cubeCobraID = GULCHDALE_CUBE_ID;
	environment.settings ??= { refillWhenEmpty: false };
	environment.settings.cardBack = "/img/gulchdale-card-back.png";
	return environment;
}

export function applyGulchdaleEnvironment(session: Session): void {
	session.setCustomCardList(cloneGulchdaleEnvironment());
	session.maxPlayers = GULCHDALE_MAX_PLAYERS;
	session.maxTimer = GULCHDALE_DEFAULT_TIMER;
	session.bots = 0;
	session.sendResultsToCubeCobra = false;
}

export function isGulchdaleSession(session: Session | undefined): boolean {
	return (
		!!session &&
		session.useCustomCardList &&
		session.customCardList?.name === GULCHDALE_CUBE_NAME &&
		session.customCardList?.cubeCobraID === GULCHDALE_CUBE_ID
	);
}
