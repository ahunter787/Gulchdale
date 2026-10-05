import { expect } from "chai";
import { after, before, describe, it } from "mocha";

import { Connections } from "../src/Connection.js";
import { SocketAck } from "../src/Message.js";
import { Sessions } from "../src/Session.js";
import { getUID, makeClients, waitForClientDisconnects } from "./src/common.js";

describe("Gulchdale campfire controls", function () {
	this.timeout(10_000);

	const sessionID = "gulchdale-controls";
	let clients: ReturnType<typeof makeClients> = [];
	let ownerIdx = 0;
	let otherIndices: number[] = [];

	before(function (done) {
		clients = makeClients(
			[
				{ userID: "campfire-one", sessionID, userName: "Host" },
				{ userID: "campfire-two", sessionID, userName: "Player Two" },
				{ userID: "campfire-three", sessionID, userName: "Player Three" },
				{ userID: "campfire-four", sessionID, userName: "Player Four" },
			],
			() => {
				ownerIdx = clients.findIndex((client) => getUID(client) === Sessions[sessionID].owner);
				otherIndices = clients.map((_, index) => index).filter((index) => index !== ownerIdx);
				done();
			}
		);
	});

	after(function (done) {
		for (const client of clients) client.disconnect();
		waitForClientDisconnects(done);
	});

	it("trims and broadcasts an acknowledged display-name change", async function () {
		const owner = clients[ownerIdx];
		const observer = clients[otherIndices[0]];
		const update = new Promise<{ userID: string; updatedProperties: { userName?: string } }>((resolve) =>
			observer.once("updateUser", resolve)
		);
		const acknowledgement = new Promise<SocketAck & { userName?: string }>((resolve) =>
			owner.emit("setUserName", "  Trail Boss  ", resolve)
		);

		const [data, ack] = await Promise.all([update, acknowledgement]);
		expect(ack.code).to.equal(0);
		expect(ack.userName).to.equal("Trail Boss");
		expect(data.userID).to.equal(getUID(owner));
		expect(data.updatedProperties.userName).to.equal("Trail Boss");
		expect(Connections[getUID(owner)].userName).to.equal("Trail Boss");
	});

	it("rejects blank, oversized, and case-insensitive duplicate names", async function () {
		const client = clients[otherIndices[0]];
		const originalName = Connections[getUID(client)].userName;
		const blank = await new Promise<SocketAck>((resolve) => client.emit("setUserName", "   ", resolve));
		const oversized = await new Promise<SocketAck>((resolve) =>
			client.emit("setUserName", "x".repeat(51), resolve)
		);
		const duplicate = await new Promise<SocketAck>((resolve) => client.emit("setUserName", "trail boss", resolve));

		expect(blank.error?.title).to.equal("Invalid display name");
		expect(oversized.error?.title).to.equal("Invalid display name");
		expect(duplicate.error?.title).to.equal("Name already in use");
		expect(Connections[getUID(client)].userName).to.equal(originalName);
	});

	it("rejects moderation attempts from non-owners", async function () {
		const response = await new Promise<SocketAck>((resolve) =>
			clients[otherIndices[0]].emit("removePlayer", getUID(clients[otherIndices[1]]), resolve)
		);
		expect(response.code).to.equal(401);
		expect(response.error?.title).to.equal("Unauthorized");
	});

	it("allows the owner to remove an accidental join", async function () {
		const target = clients[otherIndices[1]];
		const moved = new Promise<string>((resolve) => target.once("setSession", resolve));
		const acknowledgement = new Promise<SocketAck>((resolve) =>
			clients[ownerIdx].emit("removePlayer", getUID(target), resolve)
		);

		const [newSession, ack] = await Promise.all([moved, acknowledgement]);
		expect(ack.code).to.equal(0);
		expect(newSession).to.not.equal(sessionID);
		expect(Sessions[sessionID].users.has(getUID(target))).to.equal(false);
	});

	it("allows the owner to clear a disconnected lobby reservation", async function () {
		const owner = clients[ownerIdx];
		const target = clients[otherIndices[2]];
		const targetID = getUID(target);
		Sessions[sessionID].environmentLocked = true;
		target.disconnect();
		await new Promise<void>((resolve, reject) => {
			const deadline = Date.now() + 2_000;
			const check = () => {
				if (Sessions[sessionID].disconnectedUsers[targetID]) resolve();
				else if (Date.now() >= deadline) reject(new Error("Disconnected seat was not reserved."));
				else setTimeout(check, 10);
			};
			check();
		});

		// Regression: a reserved lobby seat has no Connection. Starting used to
		// dereference it in DraftState after consuming/generated packs.
		let startResult: SocketAck | undefined;
		expect(() => {
			startResult = Sessions[sessionID].startDraft();
		}).to.not.throw();
		expect(startResult?.error?.title).to.equal("Players unavailable");
		expect(Sessions[sessionID].drafting).to.equal(false);
		expect(Sessions[sessionID].disconnectedUsers).to.have.property(targetID);
		const response = await new Promise<SocketAck>((resolve) => owner.emit("removePlayer", targetID, resolve));
		expect(response.code).to.equal(0);
		expect(Sessions[sessionID].disconnectedUsers).to.not.have.property(targetID);
		expect(Sessions[sessionID].userOrder).to.not.include(targetID);
	});

	it("rejects a deleted Connection without mutating seating or starting a draft", function () {
		const session = Sessions[sessionID],
			stale = "deleted-stale-player";
		session.users.add(stale);
		session.userOrder.push(stale);
		const seating = [...session.userOrder];
		try {
			expect(session.startDraft().error?.title).to.equal("Players unavailable");
			expect(session.drafting).to.equal(false);
			expect(session.userOrder).to.deep.equal(seating);
		} finally {
			session.users.delete(stale);
			session.userOrder = session.userOrder.filter((id) => id !== stale);
		}
	});

	it("requires the owner to transfer ownership before leaving", async function () {
		const response = await new Promise<SocketAck>((resolve) => clients[ownerIdx].emit("leaveSession", resolve));
		expect(response.error?.title).to.equal("Transfer ownership first");
		expect(Sessions[sessionID].owner).to.equal(getUID(clients[ownerIdx]));
	});

	it("acknowledges ownership transfer and an explicit seat-clearing leave", async function () {
		const previousOwner = clients[ownerIdx];
		const nextOwner = clients[otherIndices[0]];
		const transfer = await new Promise<SocketAck>((resolve) =>
			previousOwner.emit("setSessionOwner", getUID(nextOwner), resolve)
		);
		expect(transfer.code).to.equal(0);
		expect(Sessions[sessionID].owner).to.equal(getUID(nextOwner));

		const leave = await new Promise<SocketAck>((resolve) => previousOwner.emit("leaveSession", resolve));
		expect(leave.code).to.equal(0);
		expect(Sessions[sessionID].users.has(getUID(previousOwner))).to.equal(false);
		expect(Connections[getUID(previousOwner)].sessionID).to.equal(undefined);
	});
});
