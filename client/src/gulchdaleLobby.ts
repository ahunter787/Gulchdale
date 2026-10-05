export type LobbyUser = { userID: string; userName: string; readyState?: string };
export type DisconnectedUsers = Record<string, { userName: string }>;
export type CampfireSeat = {
	index: number;
	key: string;
	userID?: string;
	name: string;
	owner: boolean;
	bot: boolean;
	ready: boolean;
	disconnected: boolean;
	status: string;
	artwork: string;
	pose: "standing" | "seated";
	mirrored: boolean;
};

export function buildCampfireSeats(options: {
	users: LobbyUser[];
	disconnectedUsers: DisconnectedUsers;
	bots: number;
	maxPlayers: number;
	sessionOwner: string;
	seatedTravelerSilhouette: string;
	seatTravelerSilhouettes: string[];
	travelerSilhouettes: string[];
}): CampfireSeat[] {
	type OccupiedSeat = Omit<CampfireSeat, "index" | "artwork" | "pose" | "mirrored">;
	const connected: OccupiedSeat[] = options.users.map((user) => ({
		key: user.userID,
		userID: user.userID,
		name: user.userName,
		owner: user.userID === options.sessionOwner,
		bot: false,
		ready: user.readyState === "Ready",
		disconnected: false,
		status:
			user.userID === options.sessionOwner
				? user.readyState === "Ready"
					? "Session owner · Ready"
					: "Session owner"
				: user.readyState === "Ready"
					? "Ready"
					: user.readyState === "NotReady"
						? "Not ready"
						: "Player",
	}));
	const disconnected: OccupiedSeat[] = Object.entries(options.disconnectedUsers)
		.filter(([id]) => !options.users.some((user) => user.userID === id))
		.map(([id, user]) => {
			return {
				key: id,
				userID: id,
				name: user.userName,
				owner: id === options.sessionOwner,
				bot: false,
				ready: false,
				disconnected: true,
				status: "Disconnected · Seat reserved",
			};
		});
	const humans = [...connected, ...disconnected].sort((a, b) => Number(b.owner) - Number(a.owner));
	const bots: OccupiedSeat[] = Array.from({ length: options.bots }, (_, offset) => {
		return {
			key: `bot-${offset}`,
			name: `Bot ${offset + 1}`,
			owner: false,
			bot: true,
			ready: true,
			disconnected: false,
			status: "Bot drafter · Ready",
		};
	});
	const occupied = [...humans, ...bots].slice(0, options.maxPlayers);
	const poseFor = (index: number): CampfireSeat["pose"] =>
		(options.seatTravelerSilhouettes[index] || options.seatedTravelerSilhouette) && index !== 0 && index !== 5
			? "seated"
			: "standing";
	const artFor = (index: number, pose: CampfireSeat["pose"]): string => {
		if (options.seatTravelerSilhouettes[index]) return options.seatTravelerSilhouettes[index];
		if (pose === "seated") return options.seatedTravelerSilhouette;
		if (index === 0) return options.travelerSilhouettes[0] ?? "";
		if (index === 5) return options.travelerSilhouettes[1] ?? options.travelerSilhouettes[0] ?? "";
		return options.travelerSilhouettes.length
			? options.travelerSilhouettes[index % options.travelerSilhouettes.length]
			: "";
	};
	return Array.from({ length: options.maxPlayers }, (_, index) => {
		const pose = poseFor(index);
		const mirrored = !options.seatTravelerSilhouettes[index] && index % 2 === 1;
		return occupied[index]
			? { ...occupied[index], index, pose, mirrored, artwork: artFor(index, pose) }
			: {
					index,
					key: `empty-${index}`,
					name: "",
					owner: false,
					bot: false,
					ready: false,
					disconnected: false,
					status: "Awaiting player",
					artwork: "",
					pose,
					mirrored,
				};
	});
}
