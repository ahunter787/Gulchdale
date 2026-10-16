// Fixed-target LAN ingress for an internal-only Docker network. No arbitrary URL
// forwarding and no credentials: targets are only verified restore-container IPs.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { execFileSync } from "node:child_process";

const run = fs.realpathSync(process.argv[2]);
const state = JSON.parse(fs.readFileSync(path.join(run, "run.json")));
if (state.run !== run || !state.project.startsWith("gulchdale-restore-")) throw Error("Invalid restore identity");
for (const [service, port, targetPort] of [
	["proxy", 18100, 80],
	["outline", 18105, 3000],
	["mailpit", 18107, 8025],
]) {
	let cached;
	let expires = 0;
	function target() {
		if (Date.now() < expires) return cached;
		const info = JSON.parse(execFileSync("docker", ["inspect", `${state.project}-${service}`]))[0];
		const network = info.NetworkSettings.Networks[`${state.project}-isolated`];
		if (
			!network ||
			info.Config.Labels["com.docker.compose.project"] !== state.project ||
			!net.isIPv4(network.IPAddress)
		)
			throw Error("Unsafe proxy target");
		cached = network.IPAddress;
		expires = Date.now() + 1000;
		return cached;
	}
	target();
	const server = http.createServer((req, res) => {
		if (req.headers.host !== `10.60.0.227:${port}`) {
			res.writeHead(400);
			res.end();
			return;
		}
		let address;
		try {
			address = target();
		} catch {
			res.writeHead(502);
			res.end();
			return;
		}
		const upstream = http.request(
			{
				host: address,
				port: targetPort,
				path: req.url,
				method: req.method,
				headers: { ...req.headers, "x-forwarded-host": req.headers.host, "x-forwarded-proto": "http" },
			},
			(r) => {
				res.writeHead(r.statusCode, r.headers);
				r.pipe(res);
			}
		);
		upstream.on("error", () => {
			if (!res.headersSent) res.writeHead(502);
			res.end("Restore service unavailable");
		});
		req.pipe(upstream);
	});
	server.on("upgrade", (req, socket, head) => {
		if (req.headers.host !== `10.60.0.227:${port}`) {
			socket.destroy();
			return;
		}
		let address;
		try {
			address = target();
		} catch {
			socket.destroy();
			return;
		}
		const upstream = net.connect(targetPort, address, () => {
			upstream.write(
				`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
					Object.entries(req.headers)
						.map(([k, v]) => `${k}: ${v}`)
						.join("\r\n") +
					"\r\n\r\n"
			);
			if (head.length) upstream.write(head);
			socket.pipe(upstream);
			upstream.pipe(socket);
		});
		upstream.on("error", () => socket.destroy());
		socket.on("error", () => upstream.destroy());
	});
	server.listen(port, "10.60.0.227", () =>
		console.log(`${service}: 10.60.0.227:${port} -> clone ${target()}:${targetPort}`)
	);
}
