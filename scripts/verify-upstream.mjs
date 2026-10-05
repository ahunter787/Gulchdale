// Isolated source archive audit: no upstream Git history enters this repository.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const pin = "11f056cc1be6f99795f89d8dc7111d98f1a83c6a";
const baseline = "gulchdale-legacy-v1.0.0";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "gulchdale-upstream-"));
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const archive = path.join(work, "upstream.tgz");
execFileSync(
	"curl",
	[
		"--fail",
		"--location",
		"--silent",
		"--show-error",
		"--max-time",
		"120",
		"https://codeload.github.com/Senryoku/Draftmancer/tar.gz/" + pin,
		"--output",
		archive,
	],
	{ stdio: "inherit" }
);
execFileSync("tar", ["-xzf", archive, "-C", work]);
const upstream = path.join(work, "Draftmancer-" + pin);
if (!fs.existsSync(upstream)) throw new Error("Archive root did not match pinned revision");
const frozen = path.join(work, "baseline");
fs.mkdirSync(frozen);
const frozenArchive = path.join(work, "baseline.tar");
execFileSync("git", ["archive", baseline, "--output", frozenArchive]);
execFileSync("tar", ["-xf", frozenArchive, "-C", frozen]);
function tree(root) {
	const files = new Map();
	function walk(dir) {
		for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			const p = path.join(dir, ent.name);
			if (ent.isDirectory()) walk(p);
			else if (ent.isFile()) files.set(path.relative(root, p).split(path.sep).join("/"), sha(fs.readFileSync(p)));
		}
	}
	walk(root);
	return files;
}
const a = tree(upstream),
	b = tree(frozen);
const entries = [];
for (const p of [...new Set([...a.keys(), ...b.keys()])].sort())
	if (a.get(p) !== b.get(p))
		entries.push({
			path: p,
			kind: !a.has(p) ? "added" : !b.has(p) ? "removed" : "changed",
			upstreamSha256: a.get(p) ?? null,
			legacySha256: b.get(p) ?? null,
		});
const manifest = {
	schemaVersion: 1,
	upstreamRepository: "https://github.com/Senryoku/Draftmancer",
	upstreamRevision: pin,
	upstreamArchiveSha256: sha(fs.readFileSync(archive)),
	baselineTag: baseline,
	baselineCommit: execFileSync("git", ["rev-parse", baseline + "^{commit}"], { encoding: "utf8" }).trim(),
	upstreamFiles: a.size,
	legacyFiles: b.size,
	identicalFiles: [...a].filter(([p, h]) => b.get(p) === h).length,
	differences: entries,
};
const target = "docs/reference/legacy-upstream-patches.json";
if (process.argv.includes("--write")) fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n");
else {
	const expected = JSON.parse(fs.readFileSync(target, "utf8"));
	if (JSON.stringify(manifest) !== JSON.stringify(expected))
		throw new Error("Upstream audit differs; review then explicitly regenerate");
}
console.log(
	"Verified pinned archive; " +
		a.size +
		" upstream files; " +
		entries.length +
		" documented differences. Temporary audit: " +
		work
);
