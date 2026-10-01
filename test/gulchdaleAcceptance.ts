import { expect } from "chai";
import { after, before, describe, it } from "mocha";

import { Connections } from "../src/Connection.js";
import { GULCHDALE_CUBE_ID, GULCHDALE_MAX_PLAYERS } from "../src/Gulchdale.js";
import { SocketAck } from "../src/Message.js";
import { Sessions } from "../src/Session.js";
import type { DraftSyncData } from "../src/DraftState.js";
import { ackNoError, getUID, makeClients, waitForClientDisconnects, waitForSocket } from "./src/common.js";

describe("Gulchdale production engine acceptance", function () {
	this.timeout(30_000);

	const sessionID = "gulchdale-acceptance";
	let clients: ReturnType<typeof makeClients> = [];
	let ownerIdx = 0;
	let nonOwnerIdx = 1;
	const states: Record<string, DraftSyncData> = {};

	before(function (done) {
		if (process.env.GULCHDALE_ACCEPTANCE !== "TRUE") {
			this.skip();
			return;
		}
		clients = makeClients(
			[
				{ userID: "gulchdale-human-one", sessionID, userName: "Human One" },
				{ userID: "gulchdale-human-two", sessionID, userName: "Human Two" },
			],
			() => {
				ownerIdx = clients.findIndex((client) => getUID(client) === Sessions[sessionID].owner);
				nonOwnerIdx = 1 - ownerIdx;
				done();
			}
		);
	});

	after(function (done) {
		for (const client of clients) client.disconnect();
		waitForClientDisconnects(done);
	});

	it("creates a locked, isolated Gulchdale session", function (done) {
		const session = Sessions[sessionID];
		expect(session.customCardList.cubeCobraID).to.equal(GULCHDALE_CUBE_ID);
		expect(session.maxPlayers).to.equal(GULCHDALE_MAX_PLAYERS);
		expect(session.maxTimer).to.equal(0);
		expect(session.bots).to.equal(0);
		expect(session.sendResultsToCubeCobra).to.equal(false);

		clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1", (ack: SocketAck) => {
			expect(ack.code).to.not.equal(0);
			expect(ack.error?.title).to.equal("Gulchdale environment is locked");
			expect(session.customCardList.cubeCobraID).to.equal(GULCHDALE_CUBE_ID);
			done();
		});
	});

	it("reserves and restores a disconnected lobby seat", function (done) {
		const reconnecting = clients[nonOwnerIdx];
		const reconnectingID = getUID(reconnecting);
		const reconnectingName = Connections[reconnectingID].userName;
		clients[ownerIdx].once("userDisconnected", (data) => {
			expect(data.disconnectedUsers[reconnectingID]?.userName).to.equal(reconnectingName);
			expect(Sessions[sessionID].users.has(reconnectingID)).to.equal(false);
			expect(Sessions[sessionID].userOrder).to.include(reconnectingID);
			waitForSocket(reconnecting, () => {
				reconnecting.once("sessionUsers", (users) => {
					expect(users.some((user) => user.userID === reconnectingID)).to.equal(true);
					expect(Sessions[sessionID].disconnectedUsers).to.not.have.property(reconnectingID);
					done();
				});
				reconnecting.connect();
			});
		});
		reconnecting.disconnect();
	});

	it("starts the four-stage draft with two humans and six bots", function (done) {
		let receivedStates = 0;
		for (const client of clients) {
			client.once("draftState", (state) => {
				expect(state.booster).to.have.length(20);
				expect(state.picksThisRound).to.equal(2);
				states[getUID(client)] = state;
				if (++receivedStates === clients.length) done();
			});
		}
		clients[ownerIdx].emit("setBots", 6);
		clients[ownerIdx].emit("startDraft", ackNoError);
	});

	it("advances one pick before reconnecting", function (done) {
		let receivedStates = 0;
		for (const client of clients) {
			client.once("draftState", (state) => {
				states[getUID(client)] = state;
				if (++receivedStates === clients.length) done();
			});
			client.emit("pickCard", { pickedCards: [0, 1], burnedCards: [] }, ackNoError);
		}
	});

	it("restores the second human's pack, pick, and pool after reconnect", function (done) {
		const reconnecting = clients[nonOwnerIdx];
		const prior = states[getUID(reconnecting)];
		clients[ownerIdx].once("userDisconnected", () => {
			waitForSocket(reconnecting, () => {
				reconnecting.once("rejoinDraft", (data) => {
					// A replacement bot may make additional picks while the player is away,
					// but the already drafted pool and live position must never regress.
					expect(data.pickedCards.main.length).to.be.at.least(2);
					expect(data.state.boosterNumber).to.be.at.least(prior.boosterNumber);
					expect(data.state.pickNumber).to.be.at.least(prior.pickNumber);
					expect(data.state.booster).to.be.an("array").and.not.empty;
					states[getUID(reconnecting)] = data.state;
					done();
				});
				reconnecting.connect();
			});
		});
		reconnecting.disconnect();
	});

	it("finishes all four stages with both human pools intact", function (done) {
		let ended = 0;
		for (const client of clients) {
			const userID = getUID(client);
			client.on("draftState", (state) => {
				if (
					state.pickNumber === states[userID].pickNumber &&
					state.boosterNumber === states[userID].boosterNumber
				)
					return;
				states[userID] = state;
				if (!state.booster?.length) return;
				const pickedCards = Array.from({ length: state.picksThisRound }, (_, index) => index);
				client.emit("pickCard", { pickedCards, burnedCards: [] }, ackNoError);
			});
			client.once("endDraft", () => {
				client.removeAllListeners("draftState");
				expect(Connections[userID].pickedCards.main.length).to.be.at.least(40);
				if (++ended === clients.length) done();
			});
			const state = states[userID];
			const pickedCards = Array.from({ length: state.picksThisRound }, (_, index) => index);
			client.emit("pickCard", { pickedCards, burnedCards: [] }, ackNoError);
		}
	});
});
