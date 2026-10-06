import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parsePlan } from "./plane-sync.mjs";
import {
	parseCatalog,
	renderMarkdown,
	renderDescription,
	plainDescription,
	normalizedHTML,
	safeLink,
	CONTENT_HEADINGS,
} from "./work-item-content.mjs";
const roadmap = fs.readFileSync(new URL("../../docs/roadmap.md", import.meta.url), "utf8");
const text = fs.readFileSync(new URL("../../docs/WORK_ITEMS.md", import.meta.url), "utf8");
const plan = parsePlan(roadmap);
const keys = [...plan.modules.map((m) => m.Module), ...plan.items.map((i) => i.key)];
const catalog = parseCatalog(text, keys);
const example =
	"## GD-000 — Example\n" + CONTENT_HEADINGS.map((h) => "### " + h + "\nReadable " + h + ".\n").join("\n");

test("all 42 records have human-first content and resolved repository references", () => {
	assert.equal(catalog.size, 42);
	for (const entry of catalog.values()) {
		const html = renderDescription(entry, "External ID: " + entry.key, (link) => {
			if (link.external) return link.external;
			assert.ok(fs.existsSync(new URL("../../" + link.file, import.meta.url)), link.file);
			return "http://outline.test/doc/" + encodeURIComponent(link.file) + link.fragment;
		});
		assert.ok(html.startsWith("<h3>Purpose</h3>"));
		assert.ok(html.endsWith("External ID: " + entry.key + "</p>"));
		assert.ok(html.indexOf("Engineering notes") > html.indexOf("Open questions"));
		assert.ok(html.includes("<h3>Completion criteria</h3>"));
	}
	const supply = catalog.get("GD-300-901").markdown;
	for (const phrase of [
		"Physical inventory",
		"two copies per card at four players and three at eight",
		"private rewards consume only the selected card",
		"no player may hold duplicates",
		"remaining questions",
		"ADR-0008",
	])
		assert.ok(supply.toLowerCase().includes(phrase.toLowerCase()), phrase);
	assert.ok(supply.includes("Future direction, not a legacy change"));
	assert.ok(catalog.get("GD-400-901").markdown.includes("already answered"));
});

test("missing, duplicate, unknown, empty, and reordered catalog sections fail", () => {
	assert.throws(() => parseCatalog(example, ["GD-000", "GD-100"]), /Missing/);
	assert.throws(() => parseCatalog(example + "\n" + example, ["GD-000"]), /Duplicate/);
	assert.throws(() => parseCatalog(example, []), /Unknown/);
	assert.throws(() => parseCatalog(example.replace("Readable Purpose.", ""), ["GD-000"]), /Empty/);
	assert.throws(
		() => parseCatalog(example.replace("### Purpose", "### Engineering notes"), ["GD-000"]),
		/headings\/order/
	);
});

test("resolved owner answers and phased proof remain explicit rather than implied implementation", () => {
	assert.equal(plan.items.find((i) => i.key === "GD-300-901").status, "Complete");
	assert.ok(catalog.get("GD-300-901").markdown.includes("Complete as an owner decision, not as an implemented simulator"));
	assert.ok(catalog.get("GD-300-002").markdown.includes("Next, not implemented"));
	assert.ok(catalog.get("GD-400-001").markdown.includes("same offer"));
	assert.ok(catalog.get("GD-500-001").markdown.includes("Not started"));
	assert.ok(catalog.get("GD-500-001").markdown.includes("client addCards event is not a grant"));
	assert.ok(catalog.get("GD-500-001").markdown.includes("not an iframe or restyled legacy"));
});

test("safe constrained Markdown renders readable headings, paragraphs, lists, emphasis, code and links", () => {
	const html = renderMarkdown(
		"### Purpose\n\nA **clear** and *small* `test`.\n\n- One\n- Two\n\n1. First\n2. Second\n\n[Guide](FOUNDATION.md)\n\n```text\n<tag>\n```"
	);
	assert.ok(html.includes("<strong>clear</strong>"));
	assert.ok(html.includes("<em>small</em>"));
	assert.ok(html.includes("<code>test</code>"));
	assert.ok(html.includes("<ul><li>One</li><li>Two</li></ul>"));
	assert.ok(html.includes("<ol><li>First</li><li>Second</li></ol>"));
	assert.ok(html.includes('<a href="docs/FOUNDATION.md">Guide</a>'));
	assert.ok(html.includes("<pre><code>&lt;tag&gt;</code></pre>"));
	const plain = plainDescription(html);
	assert.ok(plain.startsWith("Purpose\n\nA clear and small test."));
	assert.ok(plain.includes("Guide — docs/FOUNDATION.md"));
	assert.ok(!plain.includes("<h3>"));
	assert.throws(() => renderMarkdown("  - nested"), /unsupported/);
	assert.throws(() => renderMarkdown("```\nunclosed"), /Unclosed/);
});

test("raw HTML is escaped, dangerous links and escaping paths cannot become active", () => {
	assert.equal(
		renderMarkdown('<script>alert("x")</script>'),
		"<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>"
	);
	for (const url of [
		"javascript:alert",
		"data:text/html,x",
		"//host/x",
		"file:///x",
		"https://user:secret@host/x",
		"../../outside.md",
		"x\\evil.md",
		"https://host/\nfoo",
	])
		assert.throws(() => safeLink(url), /Unsafe|unsupported|Credentials|escapes/);
	assert.throws(() => renderMarkdown("[bad](javascript:alert)"), /Unsafe/);
	assert.throws(() => renderMarkdown("[good](FOUNDATION.md)", () => "javascript:alert"), /Unsafe/);
	assert.deepEqual(safeLink("../UPSTREAM.md"), { file: "UPSTREAM.md", fragment: "" });
	assert.deepEqual(safeLink("FOUNDATION.md#storage"), { file: "docs/FOUNDATION.md", fragment: "#storage" });
});

test("Plane editor chrome is ignored, but wording, URLs and list structure still detect drift", () => {
	const expected =
		'<h3>Purpose</h3><p>A &amp; B <strong>matter</strong>.</p><ul><li>One</li></ul><p><a href="http://outline/doc/one?a=1&amp;b=2">Read</a></p>';
	const editor =
		'<div><h3 data-id="h" class="editor-heading">Purpose</h3><p class="editor-paragraph-block" data-spacing-group="body" data-id="p"><span>A &#38; B <b>matter</b>.</span></p><ul class="editor-list"><li data-id="l"><p>One</p></li></ul><p><a target="_blank" class="text-link-primary" href="http://outline/doc/one?a=1&amp;b=2" rel="noopener noreferrer">Read</a></p></div>';
	assert.equal(normalizedHTML(editor), normalizedHTML(expected));
	assert.notEqual(normalizedHTML(editor.replace("matter", "changed")), normalizedHTML(expected));
	assert.notEqual(normalizedHTML(editor.replace("/doc/one", "/doc/two")), normalizedHTML(expected));
	assert.notEqual(normalizedHTML(expected.replaceAll("ul>", "ol>")), normalizedHTML(expected));
});

test("invalid catalog fails before any Plane API request or state write", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "gulchdale-catalog-preflight-"));
	fs.mkdirSync(path.join(root, "docs"));
	fs.writeFileSync(path.join(root, "docs/roadmap.md"), roadmap);
	fs.writeFileSync(path.join(root, "docs/WORK_ITEMS.md"), example);
	const r = spawnSync(process.execPath, [new URL("./plane-sync.mjs", import.meta.url).pathname, "--apply"], {
		env: {
			...process.env,
			PROJECT_ROOT: root,
			STATE_DIR: path.join(root, "state"),
			PLANE_URL: "http://127.0.0.1:1",
		},
		encoding: "utf8",
	});
	assert.ifError(r.error);
	assert.notEqual(r.status, 0);
	assert.match(r.stderr, /Missing catalog description/);
	assert.doesNotMatch(r.stderr, /fetch failed/);
	assert.ok(!fs.existsSync(path.join(root, "state")));
});
