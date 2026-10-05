import { digest, type ReleaseReference } from "./domain.js";

/** Offline Phase 2 prototype only. No Draftmancer, database or runtime integration. */
export type SupplyCategory =
	"commander" | "commander-support" | "main-pool" | "utility-land" | "tribal" | "commander-staple";
export interface SupplyCard {
	/** Canonical card identity, not a printing identity. */
	cardId: string;
	category: SupplyCategory;
}
export type Allocation =
	| { status: "allocated"; cardId: string; playerId: string }
	| { status: "duplicate-destroyed"; cardId: string; playerId: string }
	| { status: "supply-exhausted"; cardId: string; playerId: string; requiresOwnerPolicy: true };
export interface SupplyEvent {
	requestId: string;
	result: Allocation;
	remaining: number;
}
interface PrivateOffer {
	playerId: string;
	cards: string[];
	selection: { cardId: string; result: Allocation } | null;
}

/** Only the owner-approved endpoints are supported; interpolation is not a game rule. */
export function tribalCapacity(players: number): number {
	if (players === 4) return 2;
	if (players === 8) return 3;
	throw new Error("Tribal scaling requires an owner decision for " + players + " players");
}

export class SimulationSupply {
	private readonly players: Set<string>;
	private readonly catalog = new Map<string, SupplyCard>();
	private readonly pools = new Map<string, Set<string>>();
	private readonly used = new Map<string, number>();
	private readonly requests = new Map<string, { signature: string; result: Allocation }>();
	private readonly offers = new Map<string, PrivateOffer>();
	private readonly events: SupplyEvent[] = [];
	readonly release: ReleaseReference;

	constructor(players: string[], cards: SupplyCard[], release: ReleaseReference) {
		if (
			players.length < 2 ||
			players.length > 8 ||
			players.some((p) => !p) ||
			new Set(players).size !== players.length
		)
			throw new Error("Supply requires 2-8 unique player IDs");
		if (
			Object.values(release).length !== 4 ||
			[release.pool, release.metadata, release.rules, release.engine].some((v) => !/^[a-f0-9]{64}$/.test(v))
		)
			throw new Error("Supply requires immutable Pool, Metadata, Rules and Engine hashes");
		this.release = Object.freeze({ ...release });
		this.players = new Set(players);
		for (const p of players) this.pools.set(p, new Set());
		for (const card of cards) {
			if (!card.cardId || this.catalog.has(card.cardId)) throw new Error("Duplicate or empty card identity");
			if (
				!["commander", "commander-support", "main-pool", "utility-land", "tribal", "commander-staple"].includes(
					card.category
				)
			)
				throw new Error("Unsupported supply category");
			if (card.category === "tribal") tribalCapacity(players.length);
			this.catalog.set(card.cardId, { ...card });
		}
	}

	private card(playerId: string, cardId: string): SupplyCard {
		if (!this.players.has(playerId)) throw new Error("Unknown player");
		const card = this.catalog.get(cardId);
		if (!card) throw new Error("Unknown card");
		return card;
	}
	private key(playerId: string, card: SupplyCard): string {
		return card.category === "commander-staple"
			? JSON.stringify([playerId, card.cardId])
			: JSON.stringify([card.cardId]);
	}
	remaining(playerId: string, cardId: string): number {
		const card = this.card(playerId, cardId);
		const capacity = card.category === "tribal" ? tribalCapacity(this.players.size) : 1;
		return capacity - (this.used.get(this.key(playerId, card)) ?? 0);
	}
	pool(playerId: string): string[] {
		const pool = this.pools.get(playerId);
		if (!pool) throw new Error("Unknown player");
		return [...pool].sort();
	}
	audit(): { release: ReleaseReference; events: SupplyEvent[] } {
		return structuredClone({ release: this.release, events: this.events });
	}

	/** Personal injections and selected private rewards share this accounting path. */
	allocate(requestId: string, playerId: string, cardId: string): Allocation {
		if (requestId.startsWith("private:")) throw new Error("Reserved private request namespace");
		return this.allocateInternal(requestId, playerId, cardId);
	}
	private allocateInternal(requestId: string, playerId: string, cardId: string): Allocation {
		if (!requestId) throw new Error("Empty allocation request ID");
		const card = this.card(playerId, cardId);
		const signature = digest({ playerId, cardId });
		const previous = this.requests.get(requestId);
		if (previous) {
			if (previous.signature !== signature) throw new Error("Allocation request ID reused with different input");
			return { ...previous.result };
		}
		const pool = this.pools.get(playerId)!;
		let result: Allocation;
		if (pool.has(cardId)) result = { status: "duplicate-destroyed", cardId, playerId };
		else if (this.remaining(playerId, cardId) === 0)
			result = { status: "supply-exhausted", cardId, playerId, requiresOwnerPolicy: true };
		else {
			this.used.set(this.key(playerId, card), (this.used.get(this.key(playerId, card)) ?? 0) + 1);
			pool.add(cardId);
			result = { status: "allocated", cardId, playerId };
		}
		this.requests.set(requestId, { signature, result });
		this.events.push({ requestId, result: { ...result }, remaining: this.remaining(playerId, cardId) });
		return { ...result };
	}

	/** Offers do not consume supply. A competing selection can exhaust an open offer. */
	offerPrivate(offerId: string, playerId: string, cardIds: string[]): string[] {
		if (!offerId || cardIds.length === 0 || new Set(cardIds).size !== cardIds.length)
			throw new Error("Invalid private offer");
		const prior = this.offers.get(offerId);
		if (prior) {
			if (prior.playerId !== playerId || digest(prior.cards) !== digest(cardIds))
				throw new Error("Private offer ID reused with different input");
			return [...prior.cards];
		}
		for (const id of cardIds) {
			const card = this.card(playerId, id);
			if (card.category === "commander-staple") throw new Error("Commander staples are granted, never draftable");
			if (this.pools.get(playerId)!.has(id) || this.remaining(playerId, id) === 0)
				throw new Error("Ineligible private option: " + id);
		}
		this.offers.set(offerId, { playerId, cards: [...cardIds], selection: null });
		return [...cardIds];
	}
	selectPrivate(offerId: string, playerId: string, cardId: string): Allocation {
		const offer = this.offers.get(offerId);
		if (!offer || offer.playerId !== playerId || !offer.cards.includes(cardId))
			throw new Error("Invalid private selection");
		if (offer.selection) {
			if (offer.selection.cardId !== cardId) throw new Error("Private choice already resolved");
			return { ...offer.selection.result };
		}
		const result = this.allocateInternal("private:" + offerId, playerId, cardId);
		// A shortage is diagnostic, not an invented fallback or automatic choice.
		if (result.status !== "supply-exhausted") offer.selection = { cardId, result: { ...result } };
		return result;
	}
}
