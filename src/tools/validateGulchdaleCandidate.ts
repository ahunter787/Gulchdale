import fs from "fs";

import { getSheetCardIDs } from "../CustomCardList.js";
import { isSocketError } from "../Message.js";
import { parseCardList } from "../parseCardList.js";

const environmentPath = process.argv[2];
if (!environmentPath) throw new Error("Usage: validateGulchdaleCandidate <gulchdale.txt>");

const parsed = parseCardList(fs.readFileSync(environmentPath, "utf8"), {
	name: "Gulchdale",
	cubeCobraID: "f1c8be0f-7ac3-420f-81eb-ec8933ce45fa",
});
if (isSocketError(parsed)) {
	throw new Error(`${parsed.error?.title ?? "Parser error"}: ${parsed.error?.text ?? "unknown error"}`);
}

const expectedSheets = ["commander", "mono", "land"];
for (const sheet of expectedSheets) {
	if (!parsed.sheets[sheet]) throw new Error(`Required sheet '${sheet}' is missing.`);
	if (getSheetCardIDs(parsed.sheets[sheet]).length === 0) throw new Error(`Required sheet '${sheet}' is empty.`);
}

const expectedLayouts: Record<string, Record<string, number>> = {
	pack1: { commander: 4, mono: 16 },
	pack2: { commander: 2, mono: 18 },
	pack3: { mono: 20 },
	landpack: { land: 20 },
};
if (!parsed.layouts) throw new Error("Gulchdale pack layouts are missing.");
for (const [name, slots] of Object.entries(expectedLayouts)) {
	const layout = parsed.layouts[name];
	if (!layout) throw new Error(`Required layout '${name}' is missing.`);
	const actual = Object.fromEntries(layout.slots.map((slot) => [slot.sheets[0]?.name, slot.count]));
	if (JSON.stringify(actual) !== JSON.stringify(slots)) {
		throw new Error(`Layout '${name}' does not match the Gulchdale slot definition.`);
	}
}

const predetermined = parsed.settings?.predeterminedLayouts;
if (!predetermined || predetermined.length !== 4) throw new Error("Exactly four predetermined layouts are required.");
if (!parsed.settings?.boosterSettings?.every((setting) => setting.picks.every((picks) => picks === 2))) {
	throw new Error("Every Gulchdale booster must require two picks.");
}

const customCards = Object.values(parsed.customCards ?? {});
for (const card of customCards) {
	if (!card.image_uris?.en && !card.image_uris?.front) throw new Error(`Custom card '${card.name}' has no image.`);
	for (const effect of card.draft_effects ?? []) {
		if (
			effect.type === "AddCards" &&
			(!effect.cards.length || effect.count <= 0 || effect.count > effect.cards.length)
		) {
			throw new Error(`Custom card '${card.name}' has an invalid AddCards effect.`);
		}
	}
}

console.log(
	JSON.stringify({
		customCards: customCards.length,
		layouts: Object.keys(parsed.layouts),
		sheets: Object.fromEntries(expectedSheets.map((name) => [name, getSheetCardIDs(parsed.sheets[name]).length])),
	})
);
process.exit(0);
