import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const infra = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(infra, ".runtime");
const root = path.join(runtime, "restore-tests");
const host = "10.60.0.227";
const urls = { plane: `http://${host}:18100`, outline: `http://${host}:18105`, mailpit: `http://${host}:18107` };
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function write(file, data) {
	fs.writeFileSync(file, typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2), {
		mode: 0o600,
	});
}
function mkdir(dir) {
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}
function check(ok, message) {
	if (!ok) throw new Error(message);
}
function command(bin, args, options = {}) {
	try {
		return execFileSync(bin, args, {
			maxBuffer: 512 * 1024 * 1024,
			timeout: 180000,
			stdio: ["pipe", "pipe", "pipe"],
			...options,
		});
	} catch (e) {
		if (activeRun)
			write(
				path.join(activeRun, "last-command-error.log"),
				Buffer.concat([e.stdout || Buffer.alloc(0), e.stderr || Buffer.alloc(0)])
			);
		throw new Error(`${bin} command failed; details retained in protected run directory`);
	}
}
const docker = (...args) => command("docker", args);
let activeRun;
function contained(dir, parent) {
	return dir.startsWith(parent + path.sep) && dir !== parent;
}
export function parseEnv(text) {
	return Object.fromEntries(
		text
			.split(/\r?\n/)
			.filter((l) => /^[A-Za-z_][A-Za-z_0-9]*=/.test(l))
			.map((l) => {
				const i = l.indexOf("=");
				let value = l.slice(i + 1);
				if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
					value = value.slice(1, -1);
				return [l.slice(0, i), value];
			})
	);
}
export function copyTables(sql) {
	const tables = new Map();
	let current;
	for (const line of sql.split("\n")) {
		if (!current && /^COPY .+ FROM stdin;$/.test(line)) {
			current = { statement: line.replace(" FROM stdin;", " TO STDOUT;"), rows: [] };
			tables.set(line.slice(5, line.indexOf(" (")), current);
		} else if (current && line === "\\.") current = undefined;
		else if (current) current.rows.push(line);
	}
	check(!current, "Incomplete COPY data in backup");
	return tables;
}
export function rowEvidence(rows) {
	return { count: rows.length, sha256: hash([...rows].sort().join("\n")) };
}
function inspectOriginal() {
	const ids = docker("ps", "-aq").toString().trim().split(/\s+/).filter(Boolean);
	return JSON.parse(docker("inspect", ...ids)).map((c) => ({
		id: c.Id,
		name: c.Name,
		started: c.State.StartedAt,
		restarts: c.RestartCount,
		mounts: c.Mounts,
		networks: Object.keys(c.NetworkSettings.Networks).sort(),
		ports: c.HostConfig.PortBindings,
	}));
}
function compareOriginal(state) {
	const now = new Map(inspectOriginal().map((c) => [c.id, c]));
	const normalize = (c) =>
		c && { ...c, mounts: [...c.mounts].sort((a, b) => a.Destination.localeCompare(b.Destination)) };
	for (const before of state.original)
		check(
			JSON.stringify(normalize(now.get(before.id))) === JSON.stringify(normalize(before)),
			`Original container changed: ${before.name}`
		);
	for (const [file, digest] of Object.entries(state.originalConfigHashes))
		check(hash(fs.readFileSync(file)) === digest, "Live configuration changed");
}
function compose(run, ...args) {
	return docker(
		"compose",
		"--project-directory",
		run,
		"-p",
		json(path.join(run, "run.json")).project,
		"-f",
		path.join(run, "compose.json"),
		...args
	);
}
function container(run, service) {
	const state = json(path.join(run, "run.json"));
	return `${state.project}-${service}`;
}
function assertRun(run) {
	check(contained(run, root), "An explicit restore-test run path is required");
	const state = json(path.join(run, "run.json"));
	check(state.run === run && state.project.startsWith("gulchdale-restore-"), "Invalid restore run identity");
	const config = json(path.join(run, "compose.json"));
	validateConfig(config, run, state.project, state.original);
	for (const s of Object.values(config.services))
		for (const m of s.volumes || [])
			check(
				contained(fs.realpathSync(m.source), path.join(run, "storage")),
				"Storage symlink escapes restore run"
			);
	if (state.preStartupVerified) {
		const containers = JSON.parse(
			docker("inspect", ...Object.values(config.services).map((s) => s.container_name))
		);
		for (const c of containers) {
			const expected = Object.values(config.services).find((s) => s.container_name === c.Name.slice(1));
			check(
				c.Config.Labels["com.docker.compose.project"] === state.project && c.Image === expected.image,
				"Clone container/image ownership mismatch"
			);
			check(
				Object.keys(c.NetworkSettings.Networks).join() === `${state.project}-isolated`,
				"Clone joined a non-isolated network"
			);
		}
	}
	return state;
}
export function validateConfig(config, run, project, originals = []) {
	check(config.name === project && project.startsWith("gulchdale-restore-"), "Unsafe project identity");
	check(
		config.networks.isolated.internal === true && !config.networks.isolated.external,
		"Restore network must be internal"
	);
	check(
		Object.keys(config.networks).join() === "isolated" && !config.volumes,
		"Unexpected external storage/network declarations"
	);
	const oldNames = new Set(originals.map((c) => c.name.replace(/^\//, "")));
	for (const [name, s] of Object.entries(config.services)) {
		check(
			s.container_name === `${project}-${name}` && !oldNames.has(s.container_name),
			"Existing container name reused"
		);
		check(
			!s.network_mode && !s.privileged && !s.build && !s.external_links && !s.extra_hosts,
			"Unsafe container configuration"
		);
		check(JSON.stringify(s.networks) === '["isolated"]', "Non-clone network referenced");
		for (const mount of s.volumes || [])
			check(
				mount.type === "bind" &&
					contained(mount.source, path.join(run, "storage")) &&
					!mount.target.includes("docker.sock"),
				"Unsafe storage target"
			);
		for (const port of s.ports || [])
			check(
				port.host_ip === host &&
					{ proxy: 18100, outline: 18105, mailpit: 18107 }[name] === Number(port.published),
				"Unexpected published port"
			);
		for (const value of Object.values(s.environment || {}))
			check(!/10\.60\.0\.227:(810[0-7])\b/.test(String(value)), "Live service URL found in clone environment");
	}
}
async function probePorts() {
	const sockets = [];
	try {
		for (let port = 18100; port <= 18107; port++) {
			const server = net.createServer();
			await new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(port, "0.0.0.0", resolve);
			});
			sockets.push(server);
		}
	} finally {
		await Promise.all(sockets.map((s) => new Promise((resolve) => s.close(resolve))));
	}
}
function extract(archive, destination) {
	const entries = command("tar", ["tzf", archive]).toString().split("\n").filter(Boolean);
	check(
		entries.every((e) => !e.startsWith("/") && !e.split("/").includes("..")),
		"Unsafe archive entry"
	);
	check(
		!command("tar", ["tvzf", archive])
			.toString()
			.split("\n")
			.some((l) => /^[lh]/.test(l)),
		"Archive links are not permitted"
	);
	mkdir(destination);
	command("tar", ["xzf", archive, "--no-same-owner", "--no-same-permissions", "-C", destination]);
}
function makeConfig(source, state, outlineEnv, images) {
	const services = {};
	const allowed = [
		"api",
		"worker",
		"web",
		"admin",
		"space",
		"live",
		"live-exporter",
		"monitor",
		"plane-db",
		"plane-mq",
		"plane-redis",
		"plane-minio",
		"iframely",
		"proxy",
	];
	const service = (name, image, environment, other = {}) => ({
		image,
		pull_policy: "never",
		container_name: `${state.project}-${name}`,
		restart: "unless-stopped",
		networks: ["isolated"],
		environment,
		mem_limit: "2g",
		cpus: 1,
		...other,
	});
	for (const name of allowed) {
		const old = source.services[name];
		check(old, `Missing saved service ${name}`);
		const image = images.get(name);
		check(image, `No recorded image for ${name}`);
		const env = Object.fromEntries(
			Object.entries(old.environment || {}).map(([k, v]) => [
				k,
				String(v).replaceAll("http://10.60.0.227:8100", urls.plane),
			])
		);
		Object.assign(env, {
			OTEL_ENABLED: "0",
			FRONTEND_OTEL_ENABLED: "0",
			IS_AIRGAPPED: "1",
			ENABLE_SMTP: "1",
			EMAIL_HOST: "mailpit",
			EMAIL_PORT: "1025",
			EMAIL_USE_TLS: "0",
			EMAIL_USE_SSL: "0",
			GUNICORN_WORKERS: "2",
			CELERY_WORKER_CONCURRENCY: "1",
		});
		if (name === "proxy") env.SITE_ADDRESS = ":80";
		const s = service(name, image, env);
		for (const key of ["command", "entrypoint", "healthcheck", "stop_grace_period"])
			if (old[key]) s[key] = old[key];
		if (old.depends_on)
			s.depends_on = Object.fromEntries(Object.entries(old.depends_on).filter(([key]) => allowed.includes(key)));
		if (old.volumes)
			s.volumes = old.volumes.map((m) => {
				let location = path.join(state.run, "storage", name, m.target.replaceAll("/", "_"));
				if (name === "plane-minio")
					location = path.join(state.run, "storage", "minio", m.target === "/export" ? "uploads" : "data");
				return {
					type: "bind",
					source: location,
					target: m.target,
					...(m.read_only ? { read_only: true } : {}),
				};
			});
		if (name === "proxy") s.ports = [{ target: 80, published: 18100, host_ip: host, protocol: "tcp" }];
		services[name] = s;
	}
	const o = {
		...outlineEnv,
		URL: urls.outline,
		FORCE_HTTPS: "false",
		SMTP_HOST: "mailpit",
		SMTP_PORT: "1025",
		SMTP_SECURE: "false",
		ENABLE_UPDATES: "false",
		TELEMETRY_ENABLED: "false",
	};
	for (const key of ["DATABASE_URL", "REDIS_URL"]) {
		const u = new URL(o[key]);
		u.hostname = key === "DATABASE_URL" ? "outline-db" : "outline-redis";
		o[key] = u.toString();
	}
	services["outline-db"] = service(
		"outline-db",
		images.get("outline:postgres"),
		{ POSTGRES_USER: o.POSTGRES_USER, POSTGRES_PASSWORD: o.POSTGRES_PASSWORD, POSTGRES_DB: o.POSTGRES_DB },
		{
			volumes: [
				{ type: "bind", source: path.join(state.run, "storage", "outline-db"), target: "/var/lib/postgresql" },
			],
		}
	);
	services["outline-redis"] = service("outline-redis", images.get("outline:redis"), {}, {});
	services.outline = service("outline", images.get("outline:outline"), o, {
		volumes: [
			{ type: "bind", source: path.join(state.run, "storage", "outline-files"), target: "/var/lib/outline/data" },
		],
		ports: [{ target: 3000, published: 18105, host_ip: host, protocol: "tcp" }],
	});
	services.mailpit = service(
		"mailpit",
		images.get("mail:mailpit"),
		{
			MP_DATABASE: "/data/mailpit.db",
			MP_MAX_MESSAGES: "500",
			MP_SMTP_AUTH_ACCEPT_ANY: "1",
			MP_SMTP_AUTH_ALLOW_INSECURE: "1",
			MP_DISABLE_VERSION_CHECK: "true",
		},
		{
			volumes: [{ type: "bind", source: path.join(state.run, "storage", "mailpit"), target: "/data" }],
			ports: [{ target: 8025, published: 18107, host_ip: host, protocol: "tcp" }],
		}
	);
	return {
		name: state.project,
		services,
		networks: { isolated: { name: `${state.project}-isolated`, internal: true } },
	};
}
function sql(run, service, input) {
	return command(
		"docker",
		[
			"exec",
			"-i",
			container(run, service),
			"sh",
			"-c",
			'psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
		],
		{ input }
	).toString();
}
async function waitFor(checker, label, seconds = 120) {
	const end = Date.now() + seconds * 1000;
	while (Date.now() < end) {
		try {
			if (await checker()) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 2000));
	}
	throw new Error(`Timed out waiting for ${label}`);
}
function helper(state, mount, script) {
	return docker(
		"run",
		"--rm",
		"--pull=never",
		"--network=none",
		"--read-only",
		"--mount",
		`type=bind,source=${mount},target=/src,readonly`,
		state.helpers.tar,
		"sh",
		"-c",
		script
	).toString();
}
function fingerprints(state, directory) {
	return helper(state, directory, "cd /src; find . -type f -exec sha256sum {} \\; | sort");
}
function checkData(run, state, service, prefix, image) {
	const dump = path.join(state.backup, `${prefix}-db.dump`);
	const data = docker(
		"run",
		"--rm",
		"--pull=never",
		"--network=none",
		"--read-only",
		"--mount",
		`type=bind,source=${dump},target=/dump,readonly`,
		image,
		"pg_restore",
		"--data-only",
		"--file=-",
		"/dump"
	).toString();
	const tables = copyTables(data);
	check(tables.size > 0, "No table data found in dump");
	const marker = `RESTORE_${crypto.randomUUID()}`;
	let query = "SET DateStyle = ISO; SET IntervalStyle = postgres; SET extra_float_digits=3;\n";
	for (const [name, t] of tables) query += `\\echo ${marker}${name}\n${t.statement}\n`;
	const actual = new Map();
	let current;
	for (const line of sql(run, service, query).split("\n")) {
		if (line.startsWith(marker)) {
			current = [];
			actual.set(line.slice(marker.length), current);
		} else if (current) current.push(line);
	}
	const last = [...actual.values()].at(-1);
	if (last?.at(-1) === "") last.pop();
	const evidence = {};
	for (const [name, t] of tables) {
		const expected = rowEvidence(t.rows);
		const found = rowEvidence(actual.get(name) || []);
		check(JSON.stringify(expected) === JSON.stringify(found), `Restored data mismatch: ${prefix}/${name}`);
		evidence[name] = expected;
	}
	write(path.join(run, `${prefix}-data-fidelity.json`), evidence);
	console.log(`${prefix}: ${tables.size} table datasets match backup row counts and hashes`);
}
async function create(backup) {
	backup = fs.realpathSync(backup);
	check(contained(backup, path.join(runtime, "backups")), "Explicit local backup path required");
	command("sha256sum", ["--check", "--quiet", "SHA256SUMS"], { cwd: backup });
	const original = inspectOriginal();
	const metadata = json(path.join(backup, "verification.json"));
	const sources = json(path.join(backup, "sources.json"));
	for (const id of new Set([...sources.map((s) => s.Image), ...Object.values(metadata.helpers)]))
		docker("image", "inspect", id);
	await probePorts();
	mkdir(root);
	const run = fs.mkdtempSync(path.join(root, `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-`));
	activeRun = run;
	fs.chmodSync(run, 0o700);
	const project = `gulchdale-restore-${crypto.randomBytes(4).toString("hex")}`;
	const state = {
		run,
		project,
		backup,
		helpers: metadata.helpers,
		urls,
		original,
		created: new Date().toISOString(),
		originalConfigHashes: {},
	};
	for (const file of [
		path.join(runtime, "env"),
		path.join(runtime, "outline.env"),
		path.join(runtime, "plane-app", "variables.env"),
		path.join(runtime, "plane-app", "docker-compose.yml"),
		path.join(runtime, "plane-app", "docker-compose.override.yaml"),
	])
		state.originalConfigHashes[file] = hash(fs.readFileSync(file));
	write(path.join(run, "run.json"), state);
	write(
		path.join(run, "env"),
		`RESTORE_PROJECT=${project}\nRESTORE_HOST=${host}\nPLANE_HTTP_PORT=18100\nOUTLINE_HTTP_PORT=18105\nMAILPIT_HTTP_PORT=18107\nRESERVED_PORTS=18100-18107\n`
	);
	extract(path.join(backup, "runtime-config.tar.gz"), path.join(run, "source", "runtime"));
	extract(path.join(backup, "plane-deployment.tar.gz"), path.join(run, "source", "plane"));
	const savedPlane = path.join(run, "source", "plane");
	const resolved = JSON.parse(
		docker(
			"compose",
			"--project-directory",
			savedPlane,
			"--env-file",
			path.join(savedPlane, "variables.env"),
			"-f",
			path.join(savedPlane, "docker-compose.yml"),
			"-f",
			path.join(savedPlane, "docker-compose.override.yaml"),
			"config",
			"--format",
			"json"
		)
	);
	const images = new Map(
		sources.map((s) => [
			s.project === "gulchdale-plane"
				? s.service
				: `${s.project === "gulchdale-outline" ? "outline" : "mail"}:${s.service}`,
			s.Image,
		])
	);
	const config = makeConfig(
		resolved,
		state,
		parseEnv(fs.readFileSync(path.join(run, "source", "runtime", "outline.env"), "utf8")),
		images
	);
	validateConfig(config, run, project, original);
	for (const s of Object.values(config.services)) for (const m of s.volumes || []) mkdir(m.source);
	write(path.join(run, "compose.json"), JSON.stringify(config, null, 2).replaceAll("$", "$$"));
	const actualConfig = JSON.parse(compose(run, "config", "--format", "json"));
	// Compose normalizes service network arrays into maps; validate references again.
	for (const s of Object.values(actualConfig.services)) {
		check(Object.keys(s.networks).join() === "isolated", "Unexpected resolved network");
		for (const m of s.volumes || []) check(contained(m.source, path.join(run, "storage")), "Resolved live mount");
	}
	write(path.join(run, "config-deviations.json"), {
		origins: urls,
		schedulingDisabled: [
			"beat-worker",
			"automation-consumer",
			"webhook-consumer",
			"outbox-poller",
			"silo",
			"migrator",
		],
		freshCachesAndQueues: true,
		proxyState: "Fresh proxy config; archived source retained but live-origin autosave not loaded",
		egress: "Internal network; reachability proof required before apps start",
	});
	console.log(`Restore run: ${run}`);
	for (const name of ["plane-db", "outline-db"]) {
		const uid = docker(
			"run",
			"--rm",
			"--pull=never",
			"--network=none",
			"--entrypoint",
			"id",
			config.services[name].image,
			"-u",
			"postgres"
		)
			.toString()
			.trim();
		check(/^\d+$/.test(uid), "Unknown PostgreSQL runtime UID");
		docker(
			"run",
			"--rm",
			"--pull=never",
			"--network=none",
			"--mount",
			`type=bind,source=${config.services[name].volumes[0].source},target=/dst`,
			state.helpers.tar,
			"chown",
			`${uid}:${uid}`,
			"/dst"
		);
	}
	compose(run, "up", "-d", "--pull", "never", "--no-deps", "plane-db", "outline-db");
	for (const name of ["plane-db", "outline-db"])
		await waitFor(() => {
			sql(run, name, "SELECT 1;\n");
			return true;
		}, name);
	const test = `const net=require('node:net');const connect=(h,p)=>new Promise(r=>{const s=net.connect({host:h,port:p});s.setTimeout(1500);s.on('connect',()=>{s.destroy();r(true)});s.on('error',()=>r(false));s.on('timeout',()=>{s.destroy();r(false)})});(async()=>{if(!await connect('plane-db',5432))throw Error('Clone network unavailable');for(const p of [8100,8105,8107,5432,8080,8090])if(await connect('${host}',p))throw Error('Live endpoint reachable');if(await connect('1.1.1.1',443))throw Error('External egress available');console.log('Clone connectivity works; live endpoints and external egress unreachable')})().catch(e=>{console.error(e.message);process.exit(1)})`;
	write(
		path.join(run, "network-isolation.txt"),
		docker(
			"run",
			"--rm",
			"--pull=never",
			"--network",
			`${project}-isolated`,
			"--read-only",
			state.helpers.sqlite,
			"node",
			"-e",
			test
		).toString()
	);
	console.log("Network isolation proof passed; restoring clone databases");
	for (const [name, prefix] of [
		["plane-db", "plane"],
		["outline-db", "outline"],
	]) {
		command(
			"docker",
			[
				"exec",
				"-i",
				container(run, name),
				"sh",
				"-c",
				'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --exit-on-error --no-owner',
			],
			{ input: fs.readFileSync(path.join(backup, `${prefix}-db.dump`)) }
		);
		checkData(run, state, name, prefix, config.services[name].image);
	}
	state.databasesVerified = true;
	write(path.join(run, "run.json"), state);
	return finishRestore(run, state, config);
}

async function finishRestore(run, state, config) {
	const backup = state.backup;
	for (const [archive, target] of [
		["plane-minio-files", "minio"],
		["outline-files", "outline-files"],
	]) {
		const expected = path.join(run, "expected", target);
		extract(path.join(backup, `${archive}.tar.gz`), expected);
		const destination = path.join(run, "storage", target);
		mkdir(destination);
		command(
			"docker",
			[
				"run",
				"-i",
				"--rm",
				"--pull=never",
				"--network=none",
				"--mount",
				`type=bind,source=${destination},target=/dst`,
				state.helpers.tar,
				"tar",
				"xzf",
				"-",
				"-C",
				"/dst",
			],
			{ input: fs.readFileSync(path.join(backup, `${archive}.tar.gz`)) }
		);
		check(fingerprints(state, expected) === fingerprints(state, destination), "Upload hash mismatch");
		write(path.join(run, `${archive}-hashes.txt`), fingerprints(state, destination));
	}
	fs.copyFileSync(path.join(backup, "mailpit.db"), path.join(run, "storage", "mailpit", "mailpit.db"));
	fs.chmodSync(path.join(run, "storage", "mailpit", "mailpit.db"), 0o600);
	check(
		hash(fs.readFileSync(path.join(backup, "mailpit.db"))) ===
			hash(fs.readFileSync(path.join(run, "storage", "mailpit", "mailpit.db"))),
		"Mailpit snapshot mismatch"
	);
	const outlineUid = docker(
		"run",
		"--rm",
		"--pull=never",
		"--network=none",
		"--entrypoint",
		"id",
		config.services.outline.image,
		"-u"
	)
		.toString()
		.trim();
	check(/^\d+$/.test(outlineUid), "Unknown Outline runtime UID");
	docker(
		"run",
		"--rm",
		"--pull=never",
		"--network=none",
		"--mount",
		`type=bind,source=${path.join(run, "storage", "outline-files")},target=/dst`,
		state.helpers.tar,
		"chown",
		"-R",
		`${outlineUid}:${outlineUid}`,
		"/dst"
	);
	// DB settings can override environment: inspect and sanitize only the clone.
	write(
		path.join(run, "instance-config-keys.txt"),
		sql(run, "plane-db", "SELECT key FROM instance_configurations ORDER BY key;\n")
	);
	sql(
		run,
		"plane-db",
		`UPDATE instance_configurations SET value='${urls.plane}' WHERE key IN ('WEB_URL','APP_BASE_URL');\nUPDATE instance_configurations SET value='mailpit' WHERE key='EMAIL_HOST';\nUPDATE instance_configurations SET value='1025' WHERE key='EMAIL_PORT';\nUPDATE instance_configurations SET value='0' WHERE key IN ('EMAIL_USE_TLS','EMAIL_USE_SSL','IS_CHAT_SUPPORT_ENABLED','IS_GITHUB_ENABLED','IS_GITLAB_ENABLED','IS_GITEA_ENABLED','IS_GOOGLE_ENABLED','IS_LDAP_ENABLED','IS_OIDC_ENABLED','IS_SAML_ENABLED','ENABLE_GITHUB_SYNC','ENABLE_GITLAB_SYNC','ENABLE_GOOGLE_SYNC');\nUPDATE webhooks SET is_active=false WHERE is_active=true;\n`
	);
	state.preStartupVerified = true;
	write(path.join(run, "run.json"), state);
	compose(
		run,
		"up",
		"-d",
		"--pull",
		"never",
		"--no-deps",
		"mailpit",
		"plane-redis",
		"plane-mq",
		"plane-minio",
		"outline-redis",
		"monitor",
		"iframely"
	);
	compose(
		run,
		"up",
		"-d",
		"--pull",
		"never",
		"--no-deps",
		"api",
		"worker",
		"outline",
		"live",
		"live-exporter",
		"web",
		"admin",
		"space",
		"proxy"
	);
	compareOriginal(state);
	console.log(`Clone started; verification required. Run directory: ${run}`);
	return run;
}

async function verify(run) {
	const state = assertRun(run);
	activeRun = run;
	check(state.preStartupVerified, "Restore fidelity and isolation were not proved");
	compareOriginal(state);
	command("sha256sum", ["--check", "--quiet", "SHA256SUMS"], { cwd: state.backup });
	const proxyHash = hash(fs.readFileSync(path.join(infra, "integrations", "restore-proxy.mjs")));
	if (state.proxyPid && fs.existsSync(`/proc/${state.proxyPid}`) && state.proxyHash !== proxyHash) {
		const cmdline = fs.readFileSync(`/proc/${state.proxyPid}/cmdline`, "utf8");
		check(
			cmdline.includes("restore-proxy.mjs") && cmdline.includes(run),
			"Refusing to stop an unrecognized process"
		);
		process.kill(state.proxyPid, "SIGTERM");
		await waitFor(
			() => {
				try {
					return /\) Z /.test(fs.readFileSync(`/proc/${state.proxyPid}/stat`, "utf8"));
				} catch {
					return true;
				}
			},
			"clone ingress update",
			10
		);
		state.proxyPid = undefined;
	}
	if (!state.proxyPid || !fs.existsSync(`/proc/${state.proxyPid}`)) {
		await probePorts();
		const log = fs.openSync(path.join(run, "ingress.log"), "a", 0o600);
		const child = spawn(process.execPath, [path.join(infra, "integrations", "restore-proxy.mjs"), run], {
			detached: true,
			stdio: ["ignore", log, log],
		});
		child.unref();
		fs.closeSync(log);
		state.proxyPid = child.pid;
		state.proxyHash = proxyHash;
		state.ingress = "Fixed-target host process; Docker network remains internal with no published container ports";
		write(path.join(run, "run.json"), state);
	}
	for (const [name, url] of Object.entries(urls))
		await waitFor(
			async () => {
				const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
				return r.status < 500;
			},
			name,
			180
		);
	console.log("HTTP services ready; checking restored API content");
	const apiProof = await verifyAPIs(run, state);
	console.log("Restored Plane and Outline content verified; testing clone-only writes and login");
	await writeAndLogin(run, state, apiProof);
	compareOriginal(state);
	command("sha256sum", ["--check", "--quiet", "SHA256SUMS"], { cwd: state.backup });
	write(path.join(run, "verification-progress.json"), {
		httpReady: true,
		originalUnchanged: true,
		automatedComplete: true,
		complete: fs.existsSync(path.join(run, "browser-proof.json")),
	});
	write(path.join(run, "restore-report.json"), {
		run,
		backup: state.backup,
		urls,
		verifiedAt: new Date().toISOString(),
		checks: {
			preStartupDatabaseRowHashes: true,
			uploads: true,
			mailpitSnapshot: true,
			networkIsolation: true,
			apiProof,
			cloneWritesAndRestart: true,
			outlineEmailLogin: true,
			originalContainersAndConfigUnchanged: true,
			backupUnchanged: true,
		},
		limitations: [
			"Live backup is not an atomic cross-service snapshot",
			"External integrations and scheduled delivery disabled",
			"LAN ingress is a fixed-target host process; clone containers have no external routes",
			"Use separate browser profile because ports do not isolate cookies",
		],
		browserLogin: "Session callback verified; interactive browser check recorded separately",
		complete: fs.existsSync(path.join(run, "browser-proof.json")),
	});
	console.log(
		`Automated restore verification passed; interactive browser check ${fs.existsSync(path.join(run, "browser-proof.json")) ? "recorded" : "pending"}. Report: ${path.join(run, "restore-report.json")}`
	);
	return state;
}

function decodeCopy(value) {
	if (value === "\\N") return null;
	return value.replace(
		/\\([bfnrtv\\]|[0-7]{1,3})/g,
		(_, c) =>
			({ b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\" })[c] ??
			String.fromCharCode(parseInt(c, 8))
	);
}
function records(table) {
	if (!table) return [];
	const columns = table.statement
		.match(/\((.*)\)/)[1]
		.split(",")
		.map((c) => c.trim().replaceAll('"', ""));
	return table.rows.map((row) => Object.fromEntries(row.split("\t").map((v, i) => [columns[i], decodeCopy(v)])));
}
export function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((k) => [k, canonical(value[k])])
		);
	return value;
}
export function renderedContentMatches(content, markdown) {
	const words = (s) => (String(s).match(/[\p{L}\p{N}]+/gu) || []).join(" ");
	const rendered = words(markdown);
	let ok = true;
	function walk(node) {
		if (!node || typeof node !== "object") return;
		if (node.type === "text" && node.text) ok &&= rendered.includes(words(node.text));
		if (node.type === "link" && node.attrs?.href) ok &&= markdown.includes(node.attrs.href);
		for (const v of Object.values(node))
			if (Array.isArray(v)) v.forEach(walk);
			else if (v && typeof v === "object") walk(v);
	}
	walk(content);
	return ok;
}
function backupTables(state, prefix) {
	const sources = json(path.join(state.backup, "sources.json"));
	const image = sources.find(
		(s) => s.Name === `/gulchdale-${prefix === "plane" ? "plane-plane-db-1" : "outline-db"}`
	).Image;
	return copyTables(
		docker(
			"run",
			"--rm",
			"--pull=never",
			"--network=none",
			"--read-only",
			"--mount",
			`type=bind,source=${path.join(state.backup, `${prefix}-db.dump`)},target=/dump,readonly`,
			image,
			"pg_restore",
			"--data-only",
			"--file=-",
			"/dump"
		).toString()
	);
}
async function request(url, options = {}) {
	check(Object.values(urls).includes(new URL(url).origin), "HTTP verification attempted a non-clone origin");
	const r = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(30000) });
	const location = r.headers.get("location");
	if (location)
		check(Object.values(urls).includes(new URL(location, url).origin), "Clone redirected to a non-clone origin");
	return r;
}
function credentials(run) {
	const base = path.join(run, "source", "runtime", "secrets");
	return {
		plane: parseEnv(fs.readFileSync(path.join(base, "plane.env"), "utf8")),
		outline: parseEnv(fs.readFileSync(path.join(base, "outline.env"), "utf8")),
	};
}
async function planeCall(run, suffix, body) {
	const e = credentials(run).plane;
	const base = `${urls.plane}/api/v1/workspaces/${e.PLANE_WORKSPACE_SLUG}/projects/${e.PLANE_PROJECT_ID}/`;
	const r = await request(base + suffix, {
		method: body === undefined ? "GET" : "POST",
		headers: { "X-API-Key": e.PLANE_API_KEY, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	check(r.ok, `Plane clone API HTTP ${r.status} (${suffix.split("?")[0]})`);
	return r.json();
}
async function planeList(run, suffix) {
	const all = [];
	let cursor = "";
	const seen = new Set();
	for (;;) {
		const data = await planeCall(
			run,
			`${suffix}?per_page=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`
		);
		const rows = Array.isArray(data) ? data : data.results;
		check(Array.isArray(rows), "Invalid Plane list");
		all.push(...rows);
		if (Array.isArray(data) || !data.next_page_results) break;
		check(data.next_cursor && !seen.has(data.next_cursor), "Repeated Plane cursor");
		cursor = data.next_cursor;
		seen.add(cursor);
	}
	return all;
}
async function outlineCall(run, method, body) {
	const r = await request(`${urls.outline}/api/${method}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${credentials(run).outline.OUTLINE_API_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	check(r.ok, `Outline clone API ${method} HTTP ${r.status}`);
	const result = await r.json();
	check(result.ok !== false, "Outline API rejected request");
	return result.data;
}
async function verifyAPIs(run, state) {
	const expectedPlane = backupTables(state, "plane");
	const expectedOutline = backupTables(state, "outline");
	const modules = await planeList(run, "modules/");
	const issues = (await planeList(run, "issues/")).filter((i) => i.external_source !== "restore-test");
	const em = records(expectedPlane.get("public.modules")).filter((i) => !i.deleted_at);
	const ei = records(expectedPlane.get("public.issues")).filter((i) => !i.deleted_at);
	check(
		modules.length === 10 && em.length === 10 && issues.length === 34 && ei.length === 34,
		"Restored module/work-item count mismatch"
	);
	for (const [expected, actual] of [
		[em, modules],
		[ei, issues],
	])
		for (const row of expected) {
			const item = actual.find((i) => i.id === row.id);
			check(item && item.name === row.name, "Restored Plane identity/name mismatch");
			if (row.description_html !== undefined)
				check(item.description_html === row.description_html, "Plane description wording mismatch");
		}
	const membership = records(expectedPlane.get("public.module_issues")).filter((i) => !i.deleted_at);
	for (const module of modules) {
		const actual = (await planeList(run, `modules/${module.id}/module-issues/`)).map((i) => i.id).sort();
		const expected = membership
			.filter((i) => i.module_id === module.id)
			.map((i) => i.issue_id)
			.sort();
		check(JSON.stringify(actual) === JSON.stringify(expected), "Restored module membership mismatch");
	}
	const comments = records(expectedPlane.get("public.issue_comments")).filter((i) => !i.deleted_at);
	let commentCount = 0;
	for (const issue of issues) {
		const actual = await planeList(run, `issues/${issue.id}/comments/`);
		const expected = comments.filter((i) => i.issue_id === issue.id);
		check(actual.length === expected.length, "Comment count mismatch");
		for (const row of expected) {
			const c = actual.find((i) => i.id === row.id);
			check(c && c.comment_html === row.comment_html, "Comment content mismatch");
		}
		commentCount += actual.length;
	}
	const expectedDocs = records(expectedOutline.get("public.documents")).filter((d) => !d.deletedAt);
	const restoredCore = JSON.parse(
		sql(
			run,
			"outline-db",
			`SELECT coalesce(json_agg(json_build_object('id',id,'title',title,'text',text,'content',content)),'[]'::json) FROM documents WHERE "deletedAt" IS NULL;\n`
		)
	);
	for (const row of expectedDocs) {
		const d = restoredCore.find((d) => d.id === row.id);
		check(
			d &&
				d.title === row.title &&
				d.text === row.text &&
				JSON.stringify(canonical(d.content)) ===
					JSON.stringify(canonical(row.content ? JSON.parse(row.content) : null)),
			`Stored Outline content changed ${row.id}`
		);
	}
	const expectedCollections = records(expectedOutline.get("public.collections")).filter((c) => !c.deletedAt);
	const collections = await outlineCall(run, "collections.list", { limit: 100 });
	const proof = [];
	for (const c of expectedCollections) {
		check(
			collections.some((a) => a.id === c.id),
			"Outline collection missing"
		);
		let docs = [];
		for (let offset = 0; ; offset += 100) {
			const page = await outlineCall(run, "documents.list", { collectionId: c.id, limit: 100, offset });
			docs.push(...page);
			if (page.length < 100) break;
		}
		const expected = expectedDocs.filter(
			(d) => d.collectionId === c.id && !d.archivedAt && d.template !== "t" && d.template !== "true"
		);
		for (const row of expected) {
			const d = docs.find((i) => i.id === row.id);
			check(d && d.title === row.title, `Outline identity mismatch ${row.id}`);
			// Outline renders current ProseMirror JSON; its legacy text column can be
			// stale or differ in Markdown formatting. Verify exact stored JSON above,
			// and text/link preservation in the API rendering rather than equating them.
			check(
				row.content
					? renderedContentMatches(JSON.parse(row.content), d.text ?? "")
					: d.text === (row.text ?? ""),
				`Outline rendered content mismatch ${row.id}`
			);
		}
		proof.push({
			id: c.id,
			name: c.name,
			documents: expected.length,
			contentHashes: expected.map((d) => ({
				id: d.id,
				storedTextSha256: hash(d.text ?? ""),
				contentJSONSha256: hash(JSON.stringify(canonical(d.content ? JSON.parse(d.content) : null))),
				apiMarkdownSha256: hash(docs.find((a) => a.id === d.id).text ?? ""),
			})),
		});
	}
	const result = {
		modules: modules.length,
		workItems: issues.length,
		moduleMemberships: membership.length,
		comments: commentCount,
		outlineCollections: proof,
	};
	check(proof.find((c) => c.name === "Gulchdale")?.documents === 34, "Expected 34 restored engineering documents");
	check(
		proof.find((c) => c.name === "Gulchdale Game Design and Balance")?.documents > 0,
		"Owner-authored documents were not checked"
	);
	write(path.join(run, "api-fidelity.json"), result);
	return result;
}
async function writeAndLogin(run, state, apiProof) {
	const testFile = path.join(run, "test-content.json");
	const test = fs.existsSync(testFile) ? json(testFile) : {};
	if (!test.issue) {
		test.issue = await planeCall(run, "issues/", {
			name: `RESTORE TEST — ${path.basename(run)}`,
			description_html: "<p>Clone-only write and restart persistence check. Not production work.</p>",
			external_source: "restore-test",
			external_id: state.project,
		});
		write(testFile, test);
	}
	if (!test.collection) {
		test.collection = await outlineCall(run, "collections.create", {
			name: `RESTORE TEST — ${state.project}`,
			description: "Clone-only recovery validation; no production publication.",
		});
		write(testFile, test);
	}
	if (!test.document) {
		test.document = await outlineCall(run, "documents.create", {
			collectionId: test.collection.id,
			title: "RESTORE TEST — persistence",
			text: "This page exists only in the isolated restore clone.",
			publish: true,
		});
		write(testFile, test);
	}
	const rt = parseEnv(fs.readFileSync(path.join(run, "source", "runtime", "env"), "utf8"));
	const email = rt.ECOSYSTEM_ADMIN_EMAIL;
	check(email, "Backed-up login email missing");
	const jar = new Map();
	async function session(url, options = {}) {
		const headers = { ...options.headers };
		if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
		if (jar.has("csrfToken")) headers["x-csrf-token"] = jar.get("csrfToken");
		const response = await request(url, { ...options, headers });
		for (const c of response.headers.getSetCookie()) {
			const first = c.split(";")[0];
			const i = first.indexOf("=");
			jar.set(first.slice(0, i), first.slice(i + 1));
		}
		return response;
	}
	await session(urls.outline + "/");
	const before = await (await request(urls.mailpit + "/api/v1/messages?limit=100")).json();
	const old = new Set(before.messages.map((m) => m.ID));
	const login = await session(urls.outline + "/auth/email", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, client: "web" }),
	});
	check(login.ok, "Outline email login request failed");
	let message;
	await waitFor(
		async () => {
			const inbox = await (await request(urls.mailpit + "/api/v1/messages?limit=100")).json();
			for (const m of inbox.messages.filter((m) => !old.has(m.ID))) {
				const full = await (await request(urls.mailpit + "/api/v1/message/" + m.ID)).json();
				if ((full.Text || "").includes("/auth/")) {
					message = full;
					return true;
				}
			}
			return false;
		},
		"fresh clone login email",
		60
	);
	const links = (message.Text + " " + message.HTML).replaceAll("&amp;", "&").match(/https?:\/\/[^\s"<>]+/g) || [];
	const magic = links
		.map((l) => {
			try {
				return new URL(l);
			} catch {
				return null;
			}
		})
		.find((u) => u?.pathname.includes("auth") && u.searchParams.has("token"));
	check(magic && magic.origin === urls.outline, "Fresh login email does not target clone");
	write(path.join(run, "browser-login-url.txt"), magic.toString());
	const callback = await session(urls.outline + "/auth/email.callback", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ token: magic.searchParams.get("token"), follow: "true", client: "web" }),
	});
	check(
		callback.status < 400 && [...jar.keys()].some((k) => /accessToken|session/i.test(k)),
		"Outline session login failed"
	);
	const auth = await session(urls.outline + "/api/auth.info", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{}",
	});
	check(auth.ok, "Authenticated Outline session read failed");
	write(path.join(run, "login-proof.json"), {
		freshEmailInClone: true,
		linkOrigin: magic.origin,
		callbackStatus: callback.status,
		authenticatedRead: true,
	});
	compose(run, "restart", "api", "outline", "mailpit");
	await waitFor(
		async () => {
			const r = await request(urls.outline + "/");
			return r.status < 500;
		},
		"Outline restart",
		120
	);
	await waitFor(
		async () => {
			try {
				await planeCall(run, `issues/${test.issue.id}/`);
				return true;
			} catch {
				return false;
			}
		},
		"Plane restart",
		120
	);
	check(
		(await planeCall(run, `issues/${test.issue.id}/`)).name === test.issue.name,
		"Plane test write did not persist"
	);
	const docs = await outlineCall(run, "documents.list", { collectionId: test.collection.id, limit: 100 });
	check(
		docs.some((d) => d.id === test.document.id),
		"Outline test write did not persist"
	);
	await waitFor(
		async () => {
			const r = await request(urls.mailpit + "/api/v1/messages?limit=100");
			return r.ok;
		},
		"Mailpit restart",
		60
	);
	const after = await (await request(urls.mailpit + "/api/v1/messages?limit=100")).json();
	check(
		after.messages.some((m) => m.ID === message.ID),
		"Mailpit test email did not persist"
	);
	await verifyAPIs(run, state);
	write(path.join(run, "persistence-proof.json"), {
		cloneOnlyRestart: true,
		plane: true,
		outline: true,
		mailpit: true,
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const [action, supplied] = process.argv.slice(2);
		check(
			["create", "resume", "verify", "audit"].includes(action) && supplied,
			"Usage: restore-test.mjs create BACKUP | resume RUN | verify RUN | audit RUN (explicit paths required)"
		);
		if (action === "create") await create(path.resolve(supplied));
		else if (action === "resume") {
			const run = path.resolve(supplied);
			const state = assertRun(run);
			activeRun = run;
			check(!state.preStartupVerified, "Already started; use verify instead of restoring again");
			compareOriginal(state);
			command("sha256sum", ["--check", "--quiet", "SHA256SUMS"], { cwd: state.backup });
			check(fs.existsSync(path.join(run, "network-isolation.txt")), "Missing isolation proof");
			const config = JSON.parse(compose(run, "config", "--format", "json"));
			for (const [service, prefix] of [
				["plane-db", "plane"],
				["outline-db", "outline"],
			])
				checkData(run, state, service, prefix, config.services[service].image);
			state.databasesVerified = true;
			write(path.join(run, "run.json"), state);
			await finishRestore(run, state, config);
		} else if (action === "audit") {
			const run = path.resolve(supplied);
			const state = assertRun(run);
			activeRun = run;
			compareOriginal(state);
			const proof = await verifyAPIs(run, state);
			const report = json(path.join(run, "restore-report.json"));
			report.checks.apiProof = proof;
			report.images = Object.fromEntries(
				Object.entries(json(path.join(run, "compose.json")).services).map(([name, s]) => [name, s.image])
			);
			report.network = { name: state.project + "-isolated", internal: true };
			report.configDeviations = json(path.join(run, "config-deviations.json"));
			report.interactiveBrowserStatus =
				"Awaiting owner private-window confirmation; no existing browser cookies modified";
			write(path.join(run, "original-inventory-after.json"), inspectOriginal());
			report.readOnlyAuditAt = new Date().toISOString();
			write(path.join(run, "restore-report.json"), report);
			console.log(
				JSON.stringify({
					modules: proof.modules,
					workItems: proof.workItems,
					comments: proof.comments,
					collections: proof.outlineCollections.map((c) => ({ name: c.name, documents: c.documents })),
				})
			);
		} else await verify(path.resolve(supplied));
	} catch (e) {
		if (activeRun)
			write(path.join(activeRun, "failure.json"), { message: e.message, time: new Date().toISOString() });
		console.error(e.message);
		process.exitCode = 1;
	}
}
