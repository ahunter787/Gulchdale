import { describe, it } from "mocha";
import { expect } from "chai";
import { SimulationSupply, tribalCapacity, type SupplyCard } from "../src/gulchdale/supply.js";
const release = { pool: "a".repeat(64), metadata: "b".repeat(64), rules: "c".repeat(64), engine: "d".repeat(64) };
const cards: SupplyCard[] = [
	{ cardId: "goblin", category: "tribal" },
	{ cardId: "leader", category: "commander" },
	{ cardId: "support", category: "commander-support" },
	{ cardId: "ordinary", category: "main-pool" },
	{ cardId: "utility", category: "utility-land" },
	{ cardId: "tower", category: "commander-staple" },
];
const supply = () => new SimulationSupply(["a", "b", "c", "d"], cards, release);
describe("Phase 2 owner-approved supply prototype (synthetic identities, not a curated cube)", () => {
	it("supports approved tribal endpoints without inventing intermediate scaling", () => {
		expect(tribalCapacity(4)).to.equal(2);
		expect(tribalCapacity(8)).to.equal(3);
		for (const count of [2, 3, 5, 6, 7]) expect(() => tribalCapacity(count)).to.throw("owner decision");
	});
	it("shares tribal capacity across players and reports exhaustion without a fallback", () => {
		const s = supply();
		expect(s.allocate("1", "a", "goblin").status).to.equal("allocated");
		expect(s.allocate("2", "b", "goblin").status).to.equal("allocated");
		expect(s.allocate("3", "c", "goblin")).to.include({ status: "supply-exhausted", requiresOwnerPolicy: true });
		expect(s.pool("c")).to.deep.equal([]);
	});
	it("enforces session uniqueness on commanders, support, main pool and utility lands", () => {
		const s = supply();
		for (const id of ["leader", "support", "ordinary", "utility"]) {
			expect(s.allocate("a-" + id, "a", id).status).to.equal("allocated");
			expect(s.allocate("b-" + id, "b", id).status).to.equal("supply-exhausted");
		}
	});
	it("destroys duplicate allocations without spending another shared copy", () => {
		const s = supply();
		s.allocate("1", "a", "goblin");
		expect(s.allocate("2", "a", "goblin").status).to.equal("duplicate-destroyed");
		expect(s.remaining("b", "goblin")).to.equal(1);
		expect(s.pool("a")).to.deep.equal(["goblin"]);
	});
	it("grants staples once per player but never offers them as draft options", () => {
		const s = supply();
		for (const p of ["a", "b", "c", "d"]) expect(s.allocate("tower-" + p, p, "tower").status).to.equal("allocated");
		expect(s.allocate("again", "a", "tower").status).to.equal("duplicate-destroyed");
		expect(() => supply().offerPrivate("x", "a", ["tower"])).to.throw("never draftable");
	});
	it("private options consume only the selected card and preserve unselected capacity", () => {
		const s = supply();
		s.offerPrivate("choice", "a", ["goblin", "ordinary", "utility"]);
		expect(s.remaining("b", "ordinary")).to.equal(1);
		expect(s.selectPrivate("choice", "a", "ordinary").status).to.equal("allocated");
		expect(s.remaining("b", "ordinary")).to.equal(0);
		expect(s.remaining("b", "goblin")).to.equal(2);
		expect(s.remaining("b", "utility")).to.equal(1);
		expect(() => s.selectPrivate("choice", "a", "utility")).to.throw("already resolved");
	});
	it("replays allocations and choices idempotently and rejects conflicting request identities", () => {
		const s = supply();
		const first = s.allocate("once", "a", "goblin");
		expect(s.allocate("once", "a", "goblin")).to.deep.equal(first);
		expect(() => s.allocate("once", "b", "goblin")).to.throw("different input");
		s.offerPrivate("choice", "a", ["ordinary"]);
		s.offerPrivate("choice", "a", ["ordinary"]);
		expect(() => s.offerPrivate("choice", "b", ["ordinary"])).to.throw("different input");
		s.selectPrivate("choice", "a", "ordinary");
		s.selectPrivate("choice", "a", "ordinary");
		expect(s.audit().events).to.have.length(2);
	});
	it("diagnoses competing private selections without silently granting an unavailable card", () => {
		const s = supply();
		s.offerPrivate("a", "a", ["ordinary"]);
		s.offerPrivate("b", "b", ["ordinary"]);
		s.selectPrivate("a", "a", "ordinary");
		expect(s.selectPrivate("b", "b", "ordinary").status).to.equal("supply-exhausted");
		expect(s.pool("b")).to.deep.equal([]);
	});
	it("rejects invalid inputs and isolates caller mutation from accounting and audit", () => {
		expect(() => new SimulationSupply(["a", "a"], cards, release)).to.throw();
		expect(() => new SimulationSupply(["a", "b", "c"], cards, release)).to.throw("owner decision");
		expect(() => new SimulationSupply(["a", "b", "c", "d"], [...cards, cards[0]], release)).to.throw("Duplicate");
		const s = supply();
		expect(() => s.allocate("x", "missing", "goblin")).to.throw("Unknown player");
		expect(() => s.offerPrivate("x", "a", ["goblin", "goblin"])).to.throw();
		const result = s.allocate("one", "a", "goblin");
		result.status = "duplicate-destroyed";
		const audit = s.audit();
		audit.events.length = 0;
		expect(s.allocate("one", "a", "goblin").status).to.equal("allocated");
		expect(s.audit().events).to.have.length(1);
	});
});
