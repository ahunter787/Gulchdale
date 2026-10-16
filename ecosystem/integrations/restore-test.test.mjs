import { test } from "node:test";
import assert from "node:assert/strict";
import {
	copyTables,
	rowEvidence,
	validateConfig,
	parseEnv,
	canonical,
	renderedContentMatches,
} from "./restore-test.mjs";

test("COPY fidelity retains nulls, escaped values and duplicate rows, independent of ordering", () => {
	const tables = copyTables(
		"COPY public.example (id, value) FROM stdin;\n1\t\\N\n2\tline\\nvalue\n2\tline\\nvalue\n\\.\n"
	);
	assert.equal(tables.size, 1);
	const t = tables.get("public.example");
	assert.equal(t.statement, "COPY public.example (id, value) TO STDOUT;");
	assert.equal(t.rows.length, 3);
	assert.deepEqual(rowEvidence(t.rows), rowEvidence([...t.rows].reverse()));
	assert.notDeepEqual(rowEvidence(t.rows), rowEvidence(t.rows.slice(1)));
	assert.throws(() => copyTables("COPY public.example (id) FROM stdin;\n1"), /Incomplete/);
});
test("restore topology rejects live storage, ports, networks and existing containers", () => {
	const run = "/restore/run";
	const project = "gulchdale-restore-test";
	const config = {
		name: project,
		networks: { isolated: { internal: true } },
		services: {
			proxy: {
				container_name: `${project}-proxy`,
				networks: ["isolated"],
				volumes: [{ type: "bind", source: `${run}/storage/proxy`, target: "/data" }],
				ports: [{ host_ip: "10.60.0.227", published: 18100 }],
				environment: {},
			},
		},
	};
	validateConfig(config, run, project);
	for (const mutate of [
		(c) => (c.services.proxy.volumes[0].source = "/live/data"),
		(c) => (c.services.proxy.ports[0].published = 8100),
		(c) => (c.services.proxy.network_mode = "host"),
		(c) => (c.networks.isolated.external = true),
		(c) => (c.services.proxy.environment.URL = "http://10.60.0.227:8105"),
	]) {
		const bad = structuredClone(config);
		mutate(bad);
		assert.throws(() => validateConfig(bad, run, project));
	}
	assert.throws(() => validateConfig(config, run, project, [{ name: `/${project}-proxy` }]));
});
test("environment parsing does not execute shell substitutions", () => {
	assert.deepEqual(parseEnv('X="$(unsafe)"\n# comment\nPORT=18100\n'), { X: "$(unsafe)", PORT: "18100" });
});

test("Outline verification distinguishes exact stored JSON from rendered Markdown", () => {
	const content = {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text: "Preserved wording",
						marks: [{ type: "link", attrs: { href: "https://example.test/original" } }],
					},
				],
			},
		],
	};
	assert.ok(renderedContentMatches(content, "**[Preserved wording](https://example.test/original)**"));
	assert.ok(!renderedContentMatches(content, "[Changed wording](https://example.test/original)"));
	assert.ok(!renderedContentMatches(content, "[Preserved wording](https://example.test/changed)"));
	assert.deepEqual(canonical({ b: 2, a: { d: 4, c: 3 } }), canonical({ a: { c: 3, d: 4 }, b: 2 }));
});
