import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function table(text, headers) {
	const lines = text.split("\n"),
		out = [];
	let active = false;
	for (const line of lines) {
		const cells = line
			.trim()
			.split("|")
			.slice(1, -1)
			.map((x) => x.trim());
		if (cells.join("|") === headers.join("|")) {
			active = true;
			continue;
		}
		if (!active) continue;
		if (!line.startsWith("|")) {
			active = false;
			continue;
		}
		if (cells.every((x) => /^:?-+:?$/.test(x))) continue;
		if (cells.length !== headers.length) throw new Error("Malformed roadmap row: " + line);
		out.push(Object.fromEntries(headers.map((h, i) => [h, cells[i]])));
	}
	return out;
}
export function parsePlan(text) {
	const modules = table(text, ["Module", "Name"]);
	const phases = table(text, ["Phase", "Scope", "Module", "Status"]);
	const tickets = table(text, ["Ticket", "Module", "Phase", "Title", "Status", "Acceptance"]);
	const items = [
		...phases.map((r) => ({
			key: "phase-" + r.Phase.padStart(2, "0"),
			name: "Phase " + r.Phase + " — " + r.Scope,
			module: r.Module,
			status: r.Status,
			acceptance: "Exit gate: docs/architecture/SYSTEMS_MAP_v1.0.md, Phase " + r.Phase,
		})),
		...tickets.map((r) => ({
			key: r.Ticket,
			name: r.Ticket + " — " + r.Title,
			module: r.Module,
			status: r.Status,
			acceptance: r.Acceptance,
		})),
	];
	if (modules.length !== 10 || phases.length !== 11)
		throw new Error("Expected ten GD modules and eleven overhaul phases");
	if (
		modules
			.map((m) => m.Module)
			.sort()
			.join(",") !== Array.from({ length: 10 }, (_, i) => "GD-" + String(i * 100).padStart(3, "0")).join(",")
	)
		throw new Error("Expected module identities GD-000 through GD-900");
	if (
		phases
			.map((p) => Number(p.Phase))
			.sort((a, b) => a - b)
			.join(",") !== Array.from({ length: 11 }, (_, i) => i).join(",")
	)
		throw new Error("Expected overhaul phases 0 through 10");
	for (const t of tickets)
		if (!/^GD-[0-9]{3}-[0-9]{3}$/.test(t.Ticket) || !t.Ticket.startsWith(t.Module + "-"))
			throw new Error("Ticket identity must match its assigned module: " + t.Ticket);
	const ids = new Set();
	for (const r of [...modules.map((m) => ({ key: m.Module })), ...items]) {
		if (ids.has(r.key)) throw new Error("Duplicate external ID " + r.key);
		ids.add(r.key);
	}
	for (const i of items)
		if (!modules.some((m) => m.Module === i.module)) throw new Error("Unknown module " + i.module);
	return { modules, items };
}
export function group(status) {
	return (
		{ Complete: "completed", Next: "unstarted", Building: "started", Withdrawn: "cancelled" }[status] ?? "backlog"
	);
}
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const html = (text) =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

async function main() {
	const args = process.argv.slice(2);
	if (args.some((x) => !["--apply", "--check", "--verify", "--print-plan"].includes(x)))
		throw new Error("Usage: sync-roadmap.sh [--apply|--check|--verify|--print-plan]");
	const plan = parsePlan(fs.readFileSync(path.join(process.env.PROJECT_ROOT, "docs/roadmap.md"), "utf8"));
	if (args.includes("--print-plan")) {
		console.log(JSON.stringify(plan, null, 2));
		return;
	}
	const apply = args.includes("--apply"),
		verify = args.includes("--verify");
	const base =
		process.env.PLANE_URL +
		"/api/v1/workspaces/" +
		process.env.PLANE_WORKSPACE_SLUG +
		"/projects/" +
		process.env.PLANE_PROJECT_ID +
		"/";
	const source = process.env.PLANE_EXTERNAL_SOURCE;
	async function api(method, suffix, data) {
		const r = await fetch(base + suffix, {
			method,
			headers: { "X-API-Key": process.env.PLANE_API_KEY, "Content-Type": "application/json" },
			body: data === undefined ? undefined : JSON.stringify(data),
			signal: AbortSignal.timeout(30000),
		});
		if (!r.ok)
			throw new Error(
				"Plane " +
					method +
					" " +
					suffix.split("?")[0] +
					" returned HTTP " +
					r.status +
					": " +
					(await r.text()).slice(0, 500)
			);
		return r.status === 204 ? {} : r.json();
	}
	async function list(suffix) {
		const rows = [],
			cursors = new Set();
		let cursor = "";
		for (;;) {
			const d = await api(
				"GET",
				suffix + "?per_page=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "")
			);
			rows.push(...(Array.isArray(d) ? d : (d.results ?? [])));
			if (!d.next_page_results) return rows;
			if (!d.next_cursor || cursors.has(d.next_cursor)) throw new Error("Invalid/repeating Plane pagination");
			cursor = d.next_cursor;
			cursors.add(cursor);
		}
	}
	const states = await list("states/");
	if (args.includes("--check")) {
		console.log("Plane project and module API reachable");
		await list("modules/");
		return;
	}
	const project = await api("GET", "");
	for (const [name, g, color] of [
		["Backlog", "backlog", "#60646C"],
		["Next", "unstarted", "#F5A524"],
		["Building", "started", "#3E63DD"],
		["Complete", "completed", "#30A46C"],
		["Withdrawn", "cancelled", "#E5484D"],
	]) {
		if (!states.some((s) => s.group === g)) {
			if (!apply) throw new Error("Missing Plane state group " + g + "; run --apply");
			states.push(await api("POST", "states/", { name, group: g, color, default: g === "backlog" }));
		}
	}
	if (!project.module_view) {
		if (!apply) throw new Error("Plane modules are disabled; run --apply to enable the approved module roadmap");
		await api("PATCH", "", { module_view: true });
		console.log("Enabled Modules for the Gulchdale project");
	}
	const modules = await list("modules/"),
		issues = await list("issues/");
	const stateFile = path.join(process.env.STATE_DIR, "plane.json");
	const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
	const docsFile = path.join(process.env.STATE_DIR, "docs.json");
	const docs = fs.existsSync(docsFile) ? JSON.parse(fs.readFileSync(docsFile, "utf8")) : {};
	const outline =
		process.env.ECOSYSTEM_SCHEME + "://" + process.env.ECOSYSTEM_HOST + ":" + process.env.OUTLINE_HTTP_PORT;
	const refs = ["docs/roadmap.md", "docs/architecture/DESIGN_CHARTER.md", "docs/architecture/SYSTEMS_MAP_v1.0.md"];
	const description = (i) =>
		"<p>Source: docs/roadmap.md. Status: " +
		html(i.status) +
		". Module: " +
		i.module +
		".</p><p>" +
		html(i.acceptance) +
		"</p>" +
		refs
			.map((p) =>
				docs[p] ? '<p><a href="' + outline + "/doc/" + docs[p].id + '">' + p + "</a></p>" : "<p>" + p + "</p>"
			)
			.join("") +
		"<!-- ecosystem-key: " +
		i.key +
		" -->";
	let created = 0,
		updated = 0,
		membership = 0;
	const mappedModules = new Map(),
		mappedIssues = new Map();
	function match(rows, key) {
		const found = rows.filter((r) => r.external_source === source && r.external_id === key);
		if (found.length > 1) throw new Error("Duplicate published external ID " + key);
		return found[0];
	}
	const normalizedHTML = (value) =>
		(value ?? "")
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(/<\/?(?:div|span)[^>]*>/g, "")
			.replace(/ rel="[^"]*"/g, "")
			.trim();
	async function upsert(kind, key, body, rows) {
		const current = match(rows, key);
		let changed = !current;
		if (current) {
			const live = await api("GET", kind + "/" + current.id + "/");
			// Plane normalizes description_html. Hash the last sent body, but also
			// compare live name/state/external identity to catch deleted or moved work.
			changed =
				state[key]?.hash !== hash(body) ||
				live.name !== body.name ||
				(body.state && (typeof live.state === "object" ? live.state.id : live.state) !== body.state) ||
				(body.status && live.status !== body.status) ||
				(body.description !== undefined && live.description !== body.description) ||
				(body.description_html !== undefined &&
					normalizedHTML(live.description_html) !== normalizedHTML(body.description_html));
		}
		if (!current) created++;
		else if (changed) updated++;
		let result = current;
		if (apply && changed) {
			const reply = await api(current ? "PATCH" : "POST", kind + "/" + (current ? current.id + "/" : ""), body);
			result = { ...reply, id: current?.id ?? reply.id };
			if (!result.id) throw new Error("Plane did not return an ID for " + key);
		}
		if (apply && result) state[key] = { id: result.id, hash: hash(body) };
		return result;
	}
	for (const m of plan.modules) {
		const body = {
			name: m.Module + " — " + m.Name,
			description: "Source: docs/roadmap.md. " + m.Name,
			status: "planned",
			external_source: source,
			external_id: m.Module,
		};
		const r = await upsert("modules", m.Module, body, modules);
		if (r) mappedModules.set(m.Module, r.id);
	}
	for (const i of plan.items) {
		const s = states.find((s) => s.group === group(i.status));
		if (!s) throw new Error("Missing Plane state group " + group(i.status));
		const body = {
			name: i.name,
			description_html: description(i),
			state: s.id,
			external_source: source,
			external_id: i.key,
		};
		const r = await upsert("issues", i.key, body, issues);
		if (r) mappedIssues.set(i.key, r.id);
	}
	const memberships = new Map();
	for (const module of modules)
		memberships.set(
			module.external_source === source ? module.external_id : "other:" + module.id,
			new Set((await list("modules/" + module.id + "/module-issues/")).map((r) => r.id))
		);
	for (const [key, id] of mappedModules)
		if (!memberships.has(key))
			memberships.set(key, new Set((await list("modules/" + id + "/module-issues/")).map((r) => r.id)));
	for (const i of plan.items) {
		const id = mappedIssues.get(i.key);
		const existing = [...memberships].filter(([, set]) => set.has(id)).map(([key]) => key);
		if (existing.some((key) => key !== i.module))
			throw new Error(
				i.key +
					" has unexpected module membership: " +
					existing.join(", ") +
					". Owner review required; no automatic deletion."
			);
		if (!id || !memberships.get(i.module)?.has(id)) {
			membership++;
			if (apply && id)
				await api("POST", "modules/" + mappedModules.get(i.module) + "/module-issues/", { issues: [id] });
		}
	}
	const expected = new Set([...plan.modules.map((m) => m.Module), ...plan.items.map((i) => i.key)]);
	const stale = [...modules, ...issues].filter((r) => r.external_source === source && !expected.has(r.external_id));
	for (const r of stale) console.warn("Retained stale published item: " + r.external_id);
	if (apply) {
		fs.mkdirSync(process.env.STATE_DIR, { recursive: true });
		fs.writeFileSync(stateFile + ".tmp", JSON.stringify(state, null, 2) + "\n");
		fs.renameSync(stateFile + ".tmp", stateFile);
		console.log(created + " created, " + updated + " updated, " + membership + " memberships added");
	} else console.log("would create " + created + ", update " + updated + ", add " + membership + " memberships");
	console.log(
		plan.modules.length +
			" expected modules; " +
			plan.items.length +
			" expected work items; " +
			stale.length +
			" retained stale"
	);
	if (verify && (created || updated || membership)) throw new Error("Plane mirror is not synchronized");
}
if (process.argv[1] === fileURLToPath(import.meta.url))
	main().catch((e) => {
		console.error(e.message);
		process.exitCode = 1;
	});
