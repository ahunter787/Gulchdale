import { describe, it } from "mocha";
import { expect } from "chai";
import { digest } from "../src/gulchdale/domain.js";
import {
	PackSimulator,
	type CreateResult,
	type Offer,
	type SimulatorCommand,
	type PackDefinition,
	type SimulatorInput,
} from "../src/gulchdale/simulator.js";
import { definition, fixture, FAMILIES, runScenario, replayEvidence } from "../src/gulchdale/simulationProof.js";
const make = (seed = 0) => new PackSimulator(fixture(4, seed));
function create(s: PackSimulator, id: string, playerId = "seat-0", d = definition()): Offer {
	const r = s.execute({
		type: "create",
		requestId: "create-" + id + "-" + playerId,
		opportunityId: id,
		playerId,
		definition: d,
	}) as CreateResult;
	if (r.status !== "offered") throw new Error("Fixture did not offer cards");
	return r.offer;
}
function pick(s: PackSimulator, o: Offer, requestId = "pick-" + o.id) {
	return s.execute({
		type: "select",
		requestId,
		opportunityId: o.id,
		playerId: o.playerId,
		cards: o.cards.slice(0, o.definition.keep),
	});
}
function rejectedWithoutMutation(s: PackSimulator, c: SimulatorCommand, pattern?: string) {
	const before = s.snapshot();
	expect(() => s.execute(c)).to.throw(pattern);
	expect(s.snapshot()).to.deep.equal(before);
}
describe("Phase 2 immediate-pack simulator", function () {
	this.timeout(30000);
	it("requires exactly four/eight seats and validates cards, settings, balances and affinities", () => {
		for (const modify of [
			(i: SimulatorInput) => i.players.pop(),
			(i: SimulatorInput) => (i.players[1].id = i.players[0].id),
			(i: SimulatorInput) => (i.settings.guidance = Infinity),
			(i: SimulatorInput) => (i.settings.baseWeight = 0),
			(i: SimulatorInput) => (i.players[0].boosters = -1),
			(i: SimulatorInput) => i.cards.push(i.cards[0]),
			(i: SimulatorInput) => (i.cards[0].humanAffinities = { invalid: 2 }),
		]) {
			const input = fixture(4, 0);
			modify(input);
			expect(() => new PackSimulator(input)).to.throw();
		}
	});
	it("holds unique cards before presentation and never treats temporary holds as permanent exhaustion", () => {
		const s = make();
		const d = definition({ categories: ["utility-land"], options: 5, signals: {} });
		const a = create(s, "a", "seat-0", d);
		expect(s.available("seat-1", a.cards[0])).to.equal(0);
		const command: SimulatorCommand = {
			type: "create",
			requestId: "blocked",
			opportunityId: "b",
			playerId: "seat-1",
			definition: d,
		};
		expect((s.execute(command) as CreateResult).status).to.equal("temporarily-unavailable");
		rejectedWithoutMutation(s, { type: "grant", requestId: "steal", playerId: "seat-1", cardId: a.cards[0] });
		pick(s, a);
		const r = s.execute({ ...command, requestId: "retry" }) as CreateResult;
		expect(r.status).to.equal("offered");
		if (r.status === "offered") expect(r.offer.cards).not.to.include(a.cards[0]);
	});
	it("releases unselected cards, charges only success, and retains multiple picks", () => {
		const s = make(),
			o = create(s, "pick", "seat-0", definition({ options: 4, keep: 2, boosterCost: 1 }));
		expect(s.boosterBalance("seat-0")).to.equal(4);
		pick(s, o);
		expect(s.pool("seat-0")).to.deep.equal(o.cards.slice(0, 2).sort());
		expect(s.boosterBalance("seat-0")).to.equal(3);
		for (const id of o.cards.slice(2)) expect(s.available("seat-1", id)).to.equal(1);
	});
	it("decline burns one held copy, preserves booster, closes opportunity and cannot remove opponent-owned cards", () => {
		const s = make();
		s.execute({ type: "grant", requestId: "owned", playerId: "seat-1", cardId: "main-0" });
		const o = create(s, "decline", "seat-0", definition({ boosterCost: 1 }));
		rejectedWithoutMutation(s, {
			type: "decline",
			requestId: "other-pool",
			opportunityId: o.id,
			playerId: o.playerId,
			cardId: "main-0",
		});
		const c: SimulatorCommand = {
			type: "decline",
			requestId: "decline",
			opportunityId: o.id,
			playerId: o.playerId,
			cardId: o.cards[0],
		};
		const result = s.execute(c);
		expect(s.execute(c)).to.deep.equal(result);
		expect(s.available("seat-1", o.cards[0])).to.equal(0);
		expect(s.boosterBalance("seat-0")).to.equal(4);
		expect(s.pool("seat-1")).to.deep.equal(["main-0"]);
		for (const id of o.cards.slice(1)) expect(s.available("seat-1", id)).to.equal(1);
		const closed = s.execute({
			type: "create",
			requestId: "reroll",
			opportunityId: o.id,
			playerId: o.playerId,
			definition: o.definition,
		}) as CreateResult;
		expect(closed.status).to.equal("closed");
		rejectedWithoutMutation(s, {
			type: "select",
			requestId: "too-late",
			opportunityId: o.id,
			playerId: o.playerId,
			cards: [o.cards[1]],
		});
	});
	it("burns only one tribal supply copy, not every copy or printing of that card", () => {
		const s = make(),
			o = create(
				s,
				"tribal",
				"seat-0",
				definition({ kind: "tribal", tribe: "tiny", categories: ["tribal"], options: 5 })
			);
		s.execute({
			type: "decline",
			requestId: "burn-one",
			opportunityId: o.id,
			playerId: o.playerId,
			cardId: o.cards[0],
		});
		expect(s.available("seat-1", o.cards[0])).to.equal(1);
		s.execute({ type: "grant", requestId: "remaining", playerId: "seat-1", cardId: o.cards[0] });
		expect(s.available("seat-2", o.cards[0])).to.equal(0);
	});
	it("explicit remainder burns remove only unselected offered copies", () => {
		const s = make(),
			o = create(s, "burn-rest", "seat-0", definition({ remainder: "burn" }));
		pick(s, o);
		expect(s.pool("seat-0")).to.deep.equal([o.cards[0]]);
		for (const id of o.cards) expect(s.available("seat-1", id)).to.equal(0);
	});
	it("permits smaller tribal packs but never silently shrinks an alternative reward", () => {
		const s = make(),
			smaller = create(
				s,
				"small",
				"seat-0",
				definition({ kind: "tribal", tribe: "tiny", categories: ["tribal"], options: 5 })
			);
		expect(smaller.cards).to.have.length(2);
		expect(smaller.replacement).to.equal(null);
		pick(s, smaller);
		const fallback = create(
			s,
			"fallback",
			"seat-1",
			definition({ kind: "tribal", tribe: "tiny", categories: ["tribal"], options: 5, keep: 3 })
		);
		expect(fallback.cards).to.have.length(5);
		expect(fallback.replacement).to.equal("archetype-0");
	});
	it("does not shrink tribal options or substitute merely because others temporarily hold them", () => {
		const s = make(),
			d = definition({ kind: "tribal", tribe: "tiny", categories: ["tribal"], options: 5, keep: 2 });
		create(s, "a", "seat-0", d);
		create(s, "b", "seat-1", d);
		const r = s.execute({
			type: "create",
			requestId: "wait",
			opportunityId: "c",
			playerId: "seat-2",
			definition: d,
		}) as CreateResult;
		expect(r.status).to.equal("temporarily-unavailable");
	});
	it("returns explained unfulfillable rewards without spending or permitting illegal colors", () => {
		const s = make(),
			d = definition({
				kind: "tribal",
				tribe: "missing",
				categories: ["tribal"],
				fallbackCategories: ["tribal"],
				allowedColors: [],
				boosterCost: 1,
			});
		const r = s.execute({
			type: "create",
			requestId: "none",
			opportunityId: "none",
			playerId: "seat-0",
			definition: d,
		}) as CreateResult;
		expect(r.status).to.equal("unfulfillable");
		expect(s.boosterBalance("seat-0")).to.equal(4);
		expect(s.pool("seat-0")).to.deep.equal([]);
		if ("trace" in r)
			expect(r.trace.attempts[0].candidates.some((c) => c.reasons.includes("permission"))).to.equal(true);
	});
	it("prevents overlapping opportunities from promising the same booster without charging early", () => {
		const s = make(),
			d = definition({ boosterCost: 3 });
		const o = create(s, "first", "seat-0", d);
		const c: SimulatorCommand = {
			type: "create",
			requestId: "wait",
			opportunityId: "second",
			playerId: "seat-0",
			definition: d,
		};
		expect((s.execute(c) as CreateResult).status).to.equal("temporarily-unavailable");
		expect(s.boosterBalance("seat-0")).to.equal(4);
		s.execute({
			type: "decline",
			requestId: "decline",
			opportunityId: o.id,
			playerId: o.playerId,
			cardId: o.cards[0],
		});
		expect((s.execute({ ...c, requestId: "retry" }) as CreateResult).status).to.equal("offered");
	});
	it("rolls back invalid commands and rejects stale identities, counts, duplicates and unauthorized owners", () => {
		const s = make(),
			o = create(s, "a");
		for (const c of [
			{ type: "select", requestId: "x1", opportunityId: o.id, playerId: o.playerId, cards: [] },
			{ type: "select", requestId: "x2", opportunityId: o.id, playerId: "seat-1", cards: [o.cards[0]] },
			{
				type: "select",
				requestId: "x3",
				opportunityId: o.id,
				playerId: o.playerId,
				cards: [o.cards[0], o.cards[0]],
			},
			{
				type: "create",
				requestId: "x4",
				opportunityId: o.id,
				playerId: o.playerId,
				definition: definition({ options: 7 }),
			},
			{ type: "stage", requestId: "x5", stage: 0, definition: definition({ kind: "shared" }) },
		] as SimulatorCommand[])
			rejectedWithoutMutation(s, c);
	});
	it("replays requests once and cannot use different payloads with the same request identity", () => {
		const s = make(),
			o = create(s, "a", "seat-0", definition({ boosterCost: 1 }));
		const c: SimulatorCommand = {
			type: "select",
			requestId: "once",
			opportunityId: o.id,
			playerId: o.playerId,
			cards: [o.cards[0]],
		};
		const result = s.execute(c);
		expect(s.execute(c)).to.deep.equal(result);
		expect(s.boosterBalance(o.playerId)).to.equal(3);
		rejectedWithoutMutation(s, { ...c, cards: [o.cards[1]] });
	});
	it("preserves one supply policy across overlapping tribe/archetype memberships", () => {
		const s = make();
		expect(fixture(4, 0).cards.find((c) => c.cardId === "tribal-0")!.tribes).to.have.length(2);
		for (let i = 0; i < 2; i++)
			s.execute({ type: "grant", requestId: "g" + i, playerId: "seat-" + i, cardId: "tribal-0" });
		expect(s.available("seat-2", "tribal-0")).to.equal(0);
		rejectedWithoutMutation(s, { type: "grant", requestId: "extra", playerId: "seat-2", cardId: "tribal-0" });
	});
	it("keeps staples personal, excludes them from offers and destroys duplicate grants", () => {
		const s = make();
		for (let i = 0; i < 4; i++)
			s.execute({ type: "grant", requestId: "s" + i, playerId: "seat-" + i, cardId: "staple-0" });
		expect(
			s.execute({ type: "grant", requestId: "duplicate", playerId: "seat-0", cardId: "staple-0" })
		).to.deep.equal({ status: "duplicate-destroyed", cardId: "staple-0" });
		const r = s.execute({
			type: "create",
			requestId: "staples",
			opportunityId: "staples",
			playerId: "seat-0",
			definition: definition({ categories: ["commander-staple"] }),
		}) as CreateResult;
		expect(r.status).to.equal("unfulfillable");
	});
	it("records neutral scores and human overrides without silently excluding anti-affinities", () => {
		const s = make(1),
			o = create(s, "scores");
		const candidates = o.trace.attempts[0].candidates;
		const c = candidates.find((c) => c.cardId === "main-0")!;
		expect(c.contributions[0]).to.include({ affinity: 0.2, humanOverride: true });
		expect(c.weight).to.be.greaterThan(0);
		const neutral = candidates.find((c) => c.cardId === "main-3")!;
		expect(neutral.contributions.every((c) => c.affinity === 0.5)).to.equal(true);
		expect(neutral.weight).to.equal(1);
	});
	it("restores pending and completed offers through JSON snapshots and detects tampering", () => {
		const s = make(),
			o = create(s, "recovery", "seat-0", definition({ boosterCost: 1 }));
		const restored = PackSimulator.restore(JSON.parse(JSON.stringify(s.snapshot())));
		expect(restored.offer(o.id)).to.deep.equal(o);
		expect(restored.available("seat-1", o.cards[0])).to.equal(0);
		pick(restored, o);
		const second = PackSimulator.restore(restored.snapshot());
		expect(second.pool(o.playerId)).to.deep.equal([o.cards[0]]);
		const damaged = second.snapshot();
		damaged.input.seed = "tampered";
		expect(() => PackSimulator.restore(damaged)).to.throw();
	});
	it("hashes actual settings/data and ignores caller mutation and roster input order", () => {
		const input = fixture(4, 0),
			s = new PackSimulator(input),
			before = s.snapshot();
		input.cards[0].colors.length = 0;
		expect(s.snapshot()).to.deep.equal(before);
		const altered = fixture(4, 0);
		altered.cards[0].affinities["archetype-0"] = 0.1;
		expect(new PackSimulator(altered).release().metadata).not.to.equal(s.release().metadata);
		const reordered = fixture(4, 0);
		reordered.players.reverse();
		reordered.cards.reverse();
		expect(new PackSimulator(reordered).snapshot()).to.deep.equal(before);
	});
	for (const seats of [4, 8] as const)
		for (let seed = 0; seed < FAMILIES.length; seed++)
			it("replays " + FAMILIES[seed] + " at " + seats + " seats", () => {
				const e = runScenario(seats, seed);
				expect(replayEvidence(e)).to.equal(e.traceHash);
			});
	it("different seeds produce different actual card outcomes, not merely different trace labels", () => {
		const outcomes = Array.from({ length: 8 }, (_, i) => digest(runScenario(4, i * 8, false).metrics.selected));
		expect(new Set(outcomes).size).to.be.greaterThan(1);
	});
});
