import { expect } from "chai";
import { describe, it } from "mocha";

import { buildCampfireSeats } from "../client/src/gulchdaleLobby.js";

describe("Gulchdale campfire lobby", () => {
	it("maps owner, readiness, disconnected players, bots, and open seats into eight stable positions", () => {
		const seats = buildCampfireSeats({
			users: [
				{ userID: "owner", userName: "The Host With A Very Long Name", readyState: "Ready" },
				{ userID: "player", userName: "Player", readyState: "NotReady" },
			],
			disconnectedUsers: { away: { userName: "Returning Player" } },
			bots: 2,
			maxPlayers: 8,
			sessionOwner: "owner",
			travelerSilhouettes: ["one.webp", "two.webp", "three.webp", "four.webp"],
		});

		expect(seats).to.have.length(8);
		expect(seats[0]).to.include({ owner: true, ready: true, status: "Session owner · Ready" });
		expect(seats[1]).to.include({ ready: false, status: "Not ready" });
		expect(seats[2]).to.include({ disconnected: true, status: "Disconnected · Seat reserved" });
		expect(seats[3]).to.include({ bot: true, ready: true, status: "Bot drafter · Ready" });
		expect(seats[5]).to.include({ name: "", status: "Awaiting player" });
		expect(seats.map((seat) => seat.artwork)).to.deep.equal([
			"one.webp",
			"two.webp",
			"three.webp",
			"four.webp",
			"one.webp",
			"",
			"",
			"",
		]);
	});

	it("never renders more seats than the environment player limit", () => {
		const seats = buildCampfireSeats({
			users: Array.from({ length: 8 }, (_, index) => ({ userID: `${index}`, userName: `Player ${index}` })),
			disconnectedUsers: { ninth: { userName: "Ninth" } },
			bots: 4,
			maxPlayers: 8,
			sessionOwner: "0",
			travelerSilhouettes: [],
		});
		expect(seats).to.have.length(8);
		expect(seats.some((seat) => seat.name === "Ninth")).to.equal(false);
	});
});
