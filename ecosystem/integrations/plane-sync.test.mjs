import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parsePlan, group } from "./plane-sync.mjs";
const text = fs.readFileSync(new URL("../../docs/roadmap.md", import.meta.url), "utf8");
test("roadmap has ten unique modules, eleven milestones and assigned tickets", () => {
	const p = parsePlan(text);
	assert.equal(p.modules.length, 10);
	assert.equal(p.items.length, 32);
	assert.equal(new Set(p.items.map((i) => i.key)).size, p.items.length);
	for (const i of p.items) assert.ok(p.modules.some((m) => m.Module === i.module));
});
test("invalid identities or unassigned tickets are rejected", () => {
	assert.throws(() => parsePlan(text.replace("GD-000-002", "GD-000-001")), /Duplicate/);
	assert.throws(
		() => parsePlan(text.replace("| GD-000-002 | GD-000 |", "| GD-000-002 | GD-999 |")),
		/Ticket identity|Unknown module/
	);
});
test("status mapping is stable", () => {
	assert.equal(group("Complete"), "completed");
	assert.equal(group("Next"), "unstarted");
	assert.equal(group("Not started"), "backlog");
	assert.equal(group("Building"), "started");
});
