import { expect } from "chai";
import { describe, it } from "mocha";

import { buildCampfireSeats } from "../client/src/gulchdaleLobby.js";

describe("Gulchdale campfire lobby", () => {
	it("maps owner, readiness, disconnected players, bots, and open seats into eight stable positions", () => {
		const seats = buildCampfireSeats({
			users: [
				{ userID: "player", userName: "Player", readyState: "NotReady" },
				{ userID: "owner", userName: "The Host With A Very Long Name", readyState: "Ready" },
			],
			disconnectedUsers: { away: { userName: "Returning Player" } },
			bots: 2,
			maxPlayers: 8,
			sessionOwner: "owner",
			seatedTravelerSilhouette: "seated.webp",
			seatTravelerSilhouettes: [
				"seat-1.webp",
				"seat-2.webp",
				"seat-3.webp",
				"seat-4.webp",
				"seat-5.webp",
				"seat-6.webp",
				"seat-7.webp",
				"seat-8.webp",
			],
			travelerSilhouettes: ["one.webp", "two.webp", "three.webp", "four.webp"],
		});

		expect(seats).to.have.length(8);
		expect(seats[0]).to.include({ owner: true, ready: true, status: "Session owner · Ready" });
		expect(seats[1]).to.include({ ready: false, status: "Not ready" });
		expect(seats[2]).to.include({ disconnected: true, status: "Disconnected · Seat reserved" });
		expect(seats[3]).to.include({ bot: true, ready: true, status: "Bot drafter · Ready" });
		expect(seats[5]).to.include({ name: "", status: "Awaiting player" });
		expect(seats.map((seat) => seat.artwork)).to.deep.equal([
			"seat-1.webp",
			"seat-2.webp",
			"seat-3.webp",
			"seat-4.webp",
			"seat-5.webp",
			"",
			"",
			"",
		]);
		expect(seats.every((seat) => !seat.mirrored)).to.equal(true);
		expect(seats.map((seat) => seat.pose)).to.deep.equal([
			"standing",
			"seated",
			"seated",
			"seated",
			"seated",
			"standing",
			"seated",
			"seated",
		]);
	});

	it("never renders more seats than the environment player limit", () => {
		const seats = buildCampfireSeats({
			users: Array.from({ length: 8 }, (_, index) => ({ userID: `${index}`, userName: `Player ${index}` })),
			disconnectedUsers: { ninth: { userName: "Ninth" } },
			bots: 4,
			maxPlayers: 8,
			sessionOwner: "0",
			seatedTravelerSilhouette: "seated.webp",
			seatTravelerSilhouettes: [],
			travelerSilhouettes: [],
		});
		expect(seats).to.have.length(8);
		expect(seats.some((seat) => seat.name === "Ninth")).to.equal(false);
	});

	it("keeps the all-standing rotation for profiles without seated artwork", () => {
		const seats = buildCampfireSeats({
			users: [
				{ userID: "owner", userName: "Owner" },
				{ userID: "player", userName: "Player" },
			],
			disconnectedUsers: {},
			bots: 0,
			maxPlayers: 2,
			sessionOwner: "owner",
			seatedTravelerSilhouette: "",
			seatTravelerSilhouettes: [],
			travelerSilhouettes: ["one.webp", "two.webp"],
		});
		expect(seats.map((seat) => seat.pose)).to.deep.equal(["standing", "standing"]);
		expect(seats.map((seat) => seat.artwork)).to.deep.equal(["one.webp", "two.webp"]);
		expect(seats.map((seat) => seat.mirrored)).to.deep.equal([false, true]);
	});

	it("uses the generic seated traveler when a profile has no positional seat artwork", () => {
		const seats = buildCampfireSeats({
			users: [
				{ userID: "owner", userName: "Owner" },
				{ userID: "player", userName: "Player" },
			],
			disconnectedUsers: {},
			bots: 0,
			maxPlayers: 2,
			sessionOwner: "owner",
			seatedTravelerSilhouette: "seated.webp",
			seatTravelerSilhouettes: [],
			travelerSilhouettes: ["one.webp", "two.webp"],
		});
		expect(seats.map((seat) => seat.pose)).to.deep.equal(["standing", "seated"]);
		expect(seats.map((seat) => seat.artwork)).to.deep.equal(["one.webp", "seated.webp"]);
		expect(seats.map((seat) => seat.mirrored)).to.deep.equal([false, true]);
	});
});
