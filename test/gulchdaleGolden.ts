import { expect } from "chai";
import { before, after, describe, it } from "mocha";
import fs from "node:fs";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { MersenneTwister19937, type Engine } from "random-js";
import { Connections } from "../src/Connection.js";
import { Sessions } from "../src/Session.js";
import { random } from "../src/utils.js";
import { getPoDSession, restoreSession } from "../src/Persistence.js";
import type { DraftSyncData, DraftState } from "../src/DraftState.js";
import type { UniqueCard } from "../src/CardTypes.js";
import type { SocketAck } from "../src/Message.js";
import { getUID, makeClients, connectClient, waitForClientDisconnects } from "./src/common.js";
const sha = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function waitFor(check: () => boolean) {
	const until = Date.now() + 10000;
	while (!check()) {
		if (Date.now() > until) throw new Error("Golden draft timed out");
		await new Promise((r) => setTimeout(r, 5));
	}
}
describe("Golden legacy draft", function () {
	this.timeout(60000);
	let clients: ReturnType<typeof makeClients> = [],
		code: string;
	const states: Record<string, DraftSyncData> = {},
		rounds = new Set<number>(),
		awards: Record<string, UniqueCard[]> = {};
	const mutable = random as unknown as { engine: Engine };
	let saved: Engine;
	before(async function () {
		if (process.env.GULCHDALE_ACCEPTANCE !== "TRUE") {
			this.skip();
			return;
		}
		const response = await fetch("http://localhost:" + process.env.PORT + "/api/gulchdale/sessions", {
			method: "POST",
		});
		expect(response.status).to.equal(201);
		code = (await response.json()).code;
		await new Promise<void>((resolve) => {
			clients = makeClients([{ userID: "golden-0", userName: "Golden 0", sessionID: code }], resolve);
		});
		const invitation = await fetch("http://localhost:" + process.env.PORT + "/api/gulchdale/sessions/" + code);
		expect((await invitation.json()).available).to.equal(true);
		for (let i = 1; i < 8; i++) {
			const client = connectClient({ userID: "golden-" + i, userName: "Golden " + i, sessionID: code });
			clients.push(client);
			await new Promise<void>((resolve) => client.once("connect", () => resolve()));
		}
		saved = mutable.engine;
		mutable.engine = MersenneTwister19937.seed(20261005);
		for (const c of clients) {
			const uid = getUID(c);
			awards[uid] = [];
			c.on("draftState", (s) => {
				states[uid] = s;
				if (s.booster?.length) rounds.add(s.boosterNumber);
			});
			c.on("addCards", (_message, cards) => {
				awards[uid].push(...cards);
			});
		}
	});
	after(async () => {
		if (saved) mutable.engine = saved;
		for (const c of clients) c.disconnect();
		await new Promise<void>((resolve) => waitForClientDisconnects(resolve));
	});
	it("hosts, joins and preserves controls on the locked environment", async () => {
		const session = Sessions[code];
		expect(session.environmentLocked).to.equal(true);
		session.userOrder = clients.map(getUID);
		session.randomizeSeatingOrder = false;
		const ack = await new Promise<SocketAck>((resolve) =>
			clients[1].emit("setUserName", "Golden Traveler", resolve)
		);
		expect(ack.code).to.equal(0);
		expect(Connections[getUID(clients[1])].userName).to.equal("Golden Traveler");
		const owner = clients.find((c) => getUID(c) === session.owner)!;
		const denied = await new Promise<SocketAck>((resolve) =>
			clients.find((c) => c !== owner)!.emit("removePlayer", getUID(owner), resolve)
		);
		expect(denied.code).not.to.equal(0);
	});
	it("replays all four rounds with effects, pool integrity, persistence and the real client exporter", async () => {
		const session = Sessions[code],
			owner = clients.find((c) => getUID(c) === session.owner)!;
		let ended = 0;
		for (const c of clients)
			c.once("endDraft", () => {
				ended++;
			});
		const start = await new Promise<SocketAck>((resolve) => owner.emit("startDraft", resolve));
		expect(start.code).to.equal(0);
		await waitFor(() => Object.keys(states).length === 8);
		const boosterHash = sha(
			session.draftLog!.boosters.map((b) => b.map((id) => session.draftLog!.carddata[id].name))
		);
		const consumed: Record<string, string> = {};
		let waves = 0;
		while (ended < 8) {
			await waitFor(
				() =>
					ended === 8 ||
					clients.every((c) => {
						const s = states[getUID(c)];
						return !!s?.booster?.length && consumed[getUID(c)] !== s.boosterNumber + ":" + s.pickNumber;
					})
			);
			if (ended === 8) break;
			for (const c of clients) {
				const uid = getUID(c),
					s = states[uid];
				consumed[uid] = s.boosterNumber + ":" + s.pickNumber;
				const indices = s
					.booster!.map((card, i) => ({ card, i }))
					.sort(
						(a, b) =>
							Number(!!b.card.draft_effects?.length) - Number(!!a.card.draft_effects?.length) || a.i - b.i
					)
					.slice(0, s.picksThisRound)
					.map((p) => p.i);
				expect(indices).to.have.length(2);
				const ack = await new Promise<SocketAck>((resolve) =>
					c.emit("pickCard", { pickedCards: indices, burnedCards: [] }, resolve)
				);
				expect(ack.code).to.equal(0);
			}
			waves++;
			if (waves === 2) {
				// The shutdown serializer makes shallow player copies before replacing
				// bot instances with POD. Supply an isolated session view here: testing
				// a restart must not serialize over the still-running test session.
				const draft = session.draftState as DraftState;
				const isolated = Object.assign(Object.create(Object.getPrototypeOf(session)), session);
				isolated.draftState = Object.assign(Object.create(Object.getPrototypeOf(draft)), draft, {
					players: Object.fromEntries(
						Object.entries(draft.players).map(([id, player]) => [id, { ...player }])
					),
				});
				const stored = getPoDSession(isolated),
					restored = restoreSession(JSON.parse(JSON.stringify(stored)), session.owner!);
				expect(restored.environmentVersion).to.equal(session.environmentVersion);
				expect(restored.disconnectedUsers[getUID(clients[0])].pickedCards.main.map((c) => c.id)).to.deep.equal(
					Connections[getUID(clients[0])].pickedCards.main.map((c) => c.id)
				);
			}
			if (waves > 45) throw new Error("Unexpected legacy phase count");
		}
		expect(waves).to.equal(40);
		expect([...rounds].sort()).to.deep.equal([0, 1, 2, 3]);
		expect(Object.values(awards).flat().length).to.be.greaterThan(0);
		const pools = clients.map((c) => Connections[getUID(c)].pickedCards.main);
		for (const [i, pool] of pools.entries()) {
			expect(pool.length).to.equal(80 + awards[getUID(clients[i])].length);
			expect(new Set(pool.map((c) => c.uniqueID)).size).to.equal(pool.length);
			for (const reward of awards[getUID(clients[i])])
				expect(pool.some((c) => c.uniqueID === reward.uniqueID)).to.equal(true);
		}
		// Execute existing browser export code without editing/duplicating its logic.
		let source = fs.readFileSync("client/src/exportToMTGA.ts", "utf8");
		source = source.replace(
			'"../../src/Constants"',
			JSON.stringify(pathToFileURL(process.cwd() + "/dist/src/Constants.js").href)
		);
		source = source.replace(
			'"../../data/J21MTGACollectorNumbers.json"',
			JSON.stringify(pathToFileURL(process.cwd() + "/data/J21MTGACollectorNumbers.json").href)
		);
		const js = ts.transpileModule(source, {
			compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
		}).outputText;
		const { exportToMTGA } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
		const output = exportToMTGA(pools[0], [], "en", null, {
			full: false,
			preferredBasics: "",
			sideboardBasics: 0,
		}) as string;
		const exportedCount = output
			.trim()
			.split("\n")
			.reduce((n, line) => n + Number(line.split(" ")[0]), 0);
		expect(exportedCount).to.equal(pools[0].length);
		const poolHash = sha(pools.map((p) => p.map((c) => c.name).sort()));
		// Fixed seed fixture is reviewed, never regenerated automatically.
		const fixture = JSON.parse(fs.readFileSync("test/data/gulchdale-golden.json", "utf8"));
		console.info(
			"Golden fingerprints: " +
				JSON.stringify({
					boosterHash,
					poolHash,
					poolCounts: pools.map((p) => p.length),
					awards: Object.values(awards).map((p) => p.length),
				})
		);
		expect(boosterHash).to.equal(fixture.boosterHash);
		expect(poolHash).to.equal(fixture.poolHash);
	});
});
