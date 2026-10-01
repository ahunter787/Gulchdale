export type LobbyUser = { userID: string; userName: string; readyState?: string };
export type DisconnectedUsers = Record<string, { userName: string }>;
export type CampfireSeat = {
	index: number;
	key: string;
	name: string;
	owner: boolean;
	bot: boolean;
	ready: boolean;
	disconnected: boolean;
	status: string;
	artwork: string;
};

export function buildCampfireSeats(options: {
	users: LobbyUser[];
	disconnectedUsers: DisconnectedUsers;
	bots: number;
	maxPlayers: number;
	sessionOwner: string;
	travelerSilhouettes: string[];
}): CampfireSeat[] {
	const art = (index: number) =>
		options.travelerSilhouettes.length
			? options.travelerSilhouettes[index % options.travelerSilhouettes.length]
			: "";
	const connected: CampfireSeat[] = options.users.map((user, index) => ({
		index,
		key: user.userID,
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
		artwork: art(index),
	}));
	const disconnected: CampfireSeat[] = Object.entries(options.disconnectedUsers)
		.filter(([id]) => !options.users.some((user) => user.userID === id))
		.map(([id, user], offset) => {
			const index = connected.length + offset;
			return {
				index,
				key: id,
				name: user.userName,
				owner: id === options.sessionOwner,
				bot: false,
				ready: false,
				disconnected: true,
				status: "Disconnected · Seat reserved",
				artwork: art(index),
			};
		});
	const humans = [...connected, ...disconnected];
	const bots: CampfireSeat[] = Array.from({ length: options.bots }, (_, offset) => {
		const index = humans.length + offset;
		return {
			index,
			key: `bot-${offset}`,
			name: `Bot ${offset + 1}`,
			owner: false,
			bot: true,
			ready: true,
			disconnected: false,
			status: "Bot drafter · Ready",
			artwork: art(index),
		};
	});
	const occupied = [...humans, ...bots].slice(0, options.maxPlayers);
	return Array.from(
		{ length: options.maxPlayers },
		(_, index) =>
			occupied[index] ?? {
				index,
				key: `empty-${index}`,
				name: "",
				owner: false,
				bot: false,
				ready: false,
				disconnected: false,
				status: "Awaiting player",
				artwork: "",
			}
	);
}
