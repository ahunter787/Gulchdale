import { expect } from "chai";
import { describe, it } from "mocha";
import { loadCommittedWorkspace, validateWorkspace } from "../src/gulchdale/import.js";
import { releasesFor, canonical, applyOverrides, affinity, cardIdentity } from "../src/gulchdale/domain.js";
import { runtimeMode, shadowReport } from "../src/gulchdale/runtime.js";
import { applicationDatabaseUrl } from "../src/gulchdale/database.js";
import { valueDiff } from "../src/gulchdale/diff.js";
describe("Gulchdale offline foundation", () => {
	it("exposes reviewable changed values without duplicating unchanged catalog records", () => {
		expect(valueDiff([{ id: "a", score: 0.2 }], [{ id: "a", score: 0.8 }])).to.deep.equal({
			added: [],
			removed: [],
			changed: [{ id: "a", changes: { score: { before: 0.2, after: 0.8 } } }],
		});
	});
	it("imports deterministically offline and reconciles the committed manifest", () => {
		const prior = globalThis.fetch;
		globalThis.fetch = async () => {
			throw new Error("Network forbidden");
		};
		try {
			const a = loadCommittedWorkspace(),
				b = loadCommittedWorkspace();
			validateWorkspace(a);
			expect(a.id).to.equal(b.id);
			expect(canonical(releasesFor(a, []))).to.equal(canonical(releasesFor(b, [])));
			expect(a.counts).to.deep.equal({
				sourceRows: 1114,
				sheets: { commander: 144, mono: 657, land: 160 },
				customCards: 66,
				draftEffectCards: 52,
				warnings: 2,
			});
			expect(a.pool.every((p) => p.data.board !== "maybeboard")).to.equal(true);
			expect(a.personalInjections).to.have.length(0);
			expect(a.archetypes).to.have.length(0);
		} finally {
			globalThis.fetch = prior;
		}
	});
	it("keeps name identity independent of printing and applies human affinities last", () => {
		expect(cardIdentity("  SWAN SONG ")).to.equal(cardIdentity("Swan Song"));
		const cards = [{ id: "one", name: "One", data: { "affinity.goblin": 0.1 } }];
		const result = applyOverrides(cards, [{ cardId: "one", field: "affinity.goblin", value: 0.9 }]);
		expect(affinity(result[0].data, "goblin")).to.equal(0.9);
		expect(affinity(result[0].data, "unclassified")).to.equal(0.5);
		expect(affinity({ importedAffinities: { goblin: 0.3 }, "affinity.goblin": 0.8 }, "goblin")).to.equal(0.8);
		expect(cards[0].data["affinity.goblin"]).to.equal(0.1);
		expect(() => applyOverrides(cards, [{ cardId: "one", field: "affinity.goblin", value: 2 }])).to.throw();
	});
	it("keeps legacy default, refuses premature cutover and isolates shadow outages", async () => {
		expect(runtimeMode("legacy")).to.equal("legacy");
		expect(() => runtimeMode("orchestrated")).to.throw("unavailable");
		expect(() => runtimeMode("bogus")).to.throw("Invalid");
		const warnings: string[] = [];
		expect(
			await shadowReport(
				async () => {
					throw new Error("password must never be logged");
				},
				(m) => warnings.push(m)
			)
		).to.equal(null);
		expect(warnings[0]).to.include("legacy drafting remains active").and.not.include("password");
	});
	it("refuses ecosystem database identities", () => {
		expect(() => applicationDatabaseUrl({ GULCHDALE_DATABASE_URL: "postgres://x:x@localhost/plane" })).to.throw();
		expect(() => applicationDatabaseUrl({ GULCHDALE_DATABASE_URL: "postgres://x:x@localhost/outline" })).to.throw();
	});
});
