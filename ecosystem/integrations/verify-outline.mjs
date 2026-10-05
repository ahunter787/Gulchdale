import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

async function api(name, body) {
	const r = await fetch(process.env.OUTLINE_URL + "/api/" + name, {
		method: "POST",
		headers: { Authorization: "Bearer " + process.env.OUTLINE_API_TOKEN, "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30000),
	});
	if (!r.ok) throw new Error("Outline " + name + " HTTP " + r.status);
	const d = await r.json();
	if (d.ok === false) throw new Error("Outline " + name + " rejected verification");
	return d.data;
}
const collection = (await api("collections.list", { limit: 100 })).find(
	(c) => c.name === process.env.OUTLINE_COLLECTION
);
if (!collection) throw new Error("Outline collection missing");
const live = [];
for (let offset = 0; ; offset += 100) {
	const page = await api("documents.list", { collectionId: collection.id, limit: 100, offset });
	live.push(...page);
	if (page.length < 100) break;
}
const state = JSON.parse(fs.readFileSync(path.join(process.env.STATE_DIR, "docs.json"), "utf8"));
const excludes = (process.env.DOCS_EXCLUDE ?? "").split(/\s+/).filter(Boolean);
const files = execFileSync("git", ["-C", process.env.PROJECT_ROOT, "ls-files", "*.md"], { encoding: "utf8" })
	.trim()
	.split("\n")
	.filter((p) => p && !excludes.some((prefix) => p.startsWith(prefix)));
for (const p of files) {
	const record = state[p],
		doc = live.find((d) => d.id === record?.id);
	if (!doc) throw new Error("Missing published document: " + p);
	if (!doc.text?.includes("ecosystem-source: " + p)) throw new Error("Incorrect source marker: " + p);
	// Exact publication hashes are checked by the dry-run publisher; inspect live
	// content too so a manual Outline edit cannot pass merely on cached state.
	const content = fs.readFileSync(path.join(process.env.PROJECT_ROOT, p), "utf8").trim();
	const semantic = (text) => (text.replace(/<!--[\s\S]*?-->/g, "").match(/[\p{L}\p{N}_]+/gu) ?? []).join(" ");
	if (semantic(doc.text) !== semantic(content)) throw new Error("Published content differs: " + p);
}
console.log(
	files.length + " Outline documents verified; " + (live.length - files.length) + " extra documents retained"
);
