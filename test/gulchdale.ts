import { expect } from "chai";
import { describe, it } from "mocha";

import { ParameterizedDraftEffectType } from "../src/CardTypes.js";
import { getCard } from "../src/Cards.js";
import { getSheetCardIDs } from "../src/CustomCardList.js";
import {
	applyGulchdaleEnvironment,
	cloneGulchdaleEnvironment,
	GULCHDALE_CUBE_ID,
	GULCHDALE_ENVIRONMENT_HASH,
	GULCHDALE_ENVIRONMENT_PROFILE,
	GULCHDALE_MANIFEST,
	isGulchdaleSession,
	migrateGulchdaleSessionIdentity,
} from "../src/Gulchdale.js";
import { Session } from "../src/Session.js";

describe("Gulchdale environment", () => {
	it("loads the pinned snapshot with the expected identity and sheets", () => {
		const environment = cloneGulchdaleEnvironment();

		expect(GULCHDALE_MANIFEST.environmentSha256).to.equal(GULCHDALE_ENVIRONMENT_HASH);
		expect(GULCHDALE_MANIFEST.version).to.equal(`gch-${GULCHDALE_ENVIRONMENT_HASH.slice(0, 12)}`);
		expect(GULCHDALE_ENVIRONMENT_PROFILE.id).to.equal("classic");
		expect(Object.isFrozen(GULCHDALE_ENVIRONMENT_PROFILE)).to.equal(true);
		expect(Object.isFrozen(GULCHDALE_ENVIRONMENT_PROFILE.stages)).to.equal(true);
		expect(Object.isFrozen(GULCHDALE_ENVIRONMENT_PROFILE.branding)).to.equal(true);
		expect(GULCHDALE_ENVIRONMENT_PROFILE.stages.map((stage) => stage.layout)).to.deep.equal([
			"pack1",
			"pack2",
			"pack3",
			"landpack",
		]);
		expect(environment.name).to.equal("Gulchdale");
		expect(environment.cubeCobraID).to.equal(GULCHDALE_CUBE_ID);
		expect(Object.keys(environment.sheets)).to.have.members(["commander", "mono", "land"]);
		for (const sheet of ["commander", "mono", "land"])
			expect(getSheetCardIDs(environment.sheets[sheet])).to.have.length(GULCHDALE_MANIFEST.counts.sheets[sheet]);
	});

	it("preserves the four current pack layouts and two-pick rule", () => {
		const environment = cloneGulchdaleEnvironment();
		expect(environment.layouts).to.not.equal(false);
		if (!environment.layouts) throw new Error("Expected Gulchdale layouts.");
		const layouts = environment.layouts;

		const slots = (layoutName: string) =>
			Object.fromEntries(layouts[layoutName].slots.map((slot) => [slot.name, slot.count]));

		expect(slots("pack1")).to.deep.equal({ commander: 4, mono: 16 });
		expect(slots("pack2")).to.deep.equal({ commander: 2, mono: 18 });
		expect(slots("pack3")).to.deep.equal({ mono: 20 });
		expect(slots("landpack")).to.deep.equal({ land: 20 });
		expect(
			environment.settings?.predeterminedLayouts?.map((pack) => pack.map((layout) => layout.name))
		).to.deep.equal([["pack1"], ["pack2"], ["pack3"], ["landpack"]]);
		expect(environment.settings?.boosterSettings).to.deep.equal([{ picks: [2], burns: [0] }]);
		expect(environment.settings?.boostersPerPlayer).to.equal(4);
	});

	it("resolves representative partner and tribal booster AddCards effects", () => {
		const environment = cloneGulchdaleEnvironment();
		const customCards = Object.values(environment.customCards ?? {});
		const pako = customCards.find((card) => card.name === "Pako, Arcane Retriever");
		const elfPack = customCards.find((card) => card.name === "Elf Booster Pack");

		expect(pako, "Pako custom card").to.exist;
		const partnerEffect = pako?.draft_effects?.find(
			(effect) => effect.type === ParameterizedDraftEffectType.AddCards
		);
		expect(partnerEffect).to.exist;
		if (!partnerEffect || partnerEffect.type !== ParameterizedDraftEffectType.AddCards)
			throw new Error("Expected Pako AddCards effect.");
		expect(partnerEffect.count).to.equal(1);
		expect(partnerEffect.cards.map((cardID) => getCard(cardID).name)).to.include("Haldan, Avid Arcanist");

		expect(elfPack, "Elf Booster Pack custom card").to.exist;
		const boosterEffect = elfPack?.draft_effects?.find(
			(effect) => effect.type === ParameterizedDraftEffectType.AddCards
		);
		expect(boosterEffect).to.exist;
		if (!boosterEffect || boosterEffect.type !== ParameterizedDraftEffectType.AddCards)
			throw new Error("Expected tribal booster AddCards effect.");
		expect(boosterEffect.count).to.equal(6);
		expect(boosterEffect.cards).to.have.length(20);
		for (const cardID of boosterEffect.cards) expect(getCard(cardID).name).to.be.a("string").and.not.empty;
	});

	it("resolves every custom-card image and referenced draft-effect card or layout", () => {
		const environment = cloneGulchdaleEnvironment();
		const customCards = Object.values(environment.customCards ?? {});
		expect(customCards).to.not.be.empty;

		for (const card of customCards) {
			expect(
				Object.values(card.image_uris).some((uri) => uri.length > 0),
				`${card.name} image`
			).to.equal(true);
			for (const effect of card.draft_effects ?? []) {
				if (effect.type === ParameterizedDraftEffectType.AddCards) {
					for (const cardID of effect.cards) {
						const referencedCard = environment.customCards?.[cardID] ?? getCard(cardID);
						expect(referencedCard.name, `${card.name} reference`).to.not.be.empty;
					}
				}
				if (effect.type === ParameterizedDraftEffectType.AddBooster) {
					for (const layout of effect.layouts ?? [])
						expect(environment.layouts && environment.layouts[layout.name], `${card.name} layout`).to.exist;
				}
			}
		}
	});

	it("clones the environment independently for each session", () => {
		const first = new Session("gulchdale-one", "owner-one");
		const second = new Session("gulchdale-two", "owner-two");
		applyGulchdaleEnvironment(first);
		applyGulchdaleEnvironment(second);

		expect(isGulchdaleSession(first)).to.equal(true);
		expect(isGulchdaleSession(second)).to.equal(true);
		expect(first.maxPlayers).to.equal(8);
		expect(first.maxTimer).to.equal(0);
		expect(first.bots).to.equal(0);
		expect(first.sendResultsToCubeCobra).to.equal(false);
		expect(first.environmentProfileID).to.equal("classic");
		expect(first.environmentVersion).to.equal(GULCHDALE_MANIFEST.version);
		expect(first.environmentLocked).to.equal(true);

		first.customCardList.name = "Mutated";
		first.customCardList.settings!.cardBack = "mutated.png";
		expect(second.customCardList.name).to.equal("Gulchdale");
		expect(second.customCardList.settings?.cardBack).to.equal("/img/gulchdale-card-back.png");
	});

	it("migrates legacy sessions without replacing their embedded environment version", () => {
		const legacy = new Session("legacy", "owner");
		legacy.setCustomCardList(cloneGulchdaleEnvironment());
		migrateGulchdaleSessionIdentity(legacy);
		expect(legacy.environmentProfileID).to.equal("classic");
		expect(legacy.environmentVersion).to.equal(GULCHDALE_MANIFEST.version);

		legacy.environmentVersion = "gch-olderfixture";
		migrateGulchdaleSessionIdentity(legacy);
		expect(legacy.environmentVersion).to.equal("gch-olderfixture");
	});
});
