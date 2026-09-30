import crypto from "crypto";
import { expect } from "chai";

import { GulchdaleFreshnessMonitor, updateCheckIntervalSeconds } from "../src/GulchdaleFreshness.js";

const source = "name,Set,Collector Number,tags,Notes\nTest,tst,1,mono,\n";
const sourceHash = crypto.createHash("sha256").update(source).digest("hex");
const manifest = {
	version: "gch-test",
	environmentSha256: "environment",
	cube: { sourceSha256: sourceHash },
};

describe("Gulchdale freshness monitor", () => {
	it("reports current and changed CubeCobra snapshots", async () => {
		const current = new GulchdaleFreshnessMonitor(manifest, 60, async () => new Response(source, { status: 200 }));
		expect((await current.check()).state).to.equal("current");
		expect(current.snapshot().lastSuccessfulCheckAt).to.be.a("string");

		const changed = new GulchdaleFreshnessMonitor(
			manifest,
			60,
			async () => new Response(source + "Changed,tst,2,mono,\n", { status: 200 })
		);
		expect((await changed.check()).state).to.equal("update_available");
	});

	it("keeps failures non-blocking and preserves the last successful check", async () => {
		let fail = false;
		const monitor = new GulchdaleFreshnessMonitor(manifest, 60, async () => {
			if (fail) throw new Error("timed out");
			return new Response(source, { status: 200 });
		});
		await monitor.check();
		const successfulAt = monitor.snapshot().lastSuccessfulCheckAt;
		fail = true;
		expect((await monitor.check()).state).to.equal("unreachable");
		expect(monitor.snapshot().lastSuccessfulCheckAt).to.equal(successfulAt);
	});

	it("can be disabled with a zero interval", async () => {
		let calls = 0;
		const monitor = new GulchdaleFreshnessMonitor(manifest, 0, async () => {
			calls += 1;
			return new Response(source);
		});
		expect((await monitor.check()).state).to.equal("disabled");
		expect(calls).to.equal(0);
		expect(updateCheckIntervalSeconds("0")).to.equal(0);
	});
});
