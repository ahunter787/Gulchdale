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
	isGulchdaleSession,
} from "../src/Gulchdale.js";
import { Session } from "../src/Session.js";

describe("Gulchdale environment", () => {
	it("loads the pinned snapshot with the expected identity and sheets", () => {
		const environment = cloneGulchdaleEnvironment();

		expect(GULCHDALE_ENVIRONMENT_HASH).to.equal("faa043e37114b395869ef7a2d426167e632f3e3f471370f957d1c17cf9523fac");
		expect(environment.name).to.equal("Gulchdale");
		expect(environment.cubeCobraID).to.equal(GULCHDALE_CUBE_ID);
		expect(Object.keys(environment.sheets)).to.have.members(["commander", "mono", "land"]);
		expect(getSheetCardIDs(environment.sheets.commander)).to.have.length(147);
		expect(getSheetCardIDs(environment.sheets.mono)).to.have.length(658);
		expect(getSheetCardIDs(environment.sheets.land)).to.have.length(160);
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

		first.customCardList.name = "Mutated";
		first.customCardList.settings!.cardBack = "mutated.png";
		expect(second.customCardList.name).to.equal("Gulchdale");
		expect(second.customCardList.settings?.cardBack).to.equal("/img/gulchdale-card-back.png");
	});
});
