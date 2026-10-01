<template>
	<section class="gulchdale-lobby" aria-labelledby="lobby-title">
		<header class="gulchdale-lobby__header">
			<div>
				<p class="gulchdale-lobby__kicker">Campfire lobby</p>
				<h1 id="lobby-title">Gather your party</h1>
				<p>{{ environmentName }} <span>·</span> {{ environmentVersion }}</p>
			</div>
			<div class="gulchdale-lobby__code">
				<img v-if="qrCode" :src="qrCode" alt="QR code for this Gulchdale invitation" />
				<div>
					<span>Invitation code</span>
					<strong>{{ inviteCode }}</strong>
					<button type="button" @click="$emit('share')">Copy invitation</button>
				</div>
			</div>
		</header>

		<div class="gulchdale-lobby__seats" :aria-label="`${occupiedSeats} of ${maxPlayers} seats occupied`">
			<article v-for="seat in seats" :key="seat.index" class="gulchdale-seat" :class="{ occupied: seat.name }">
				<div class="gulchdale-seat__ember" aria-hidden="true"></div>
				<span class="gulchdale-seat__number">{{ seat.index + 1 }}</span>
				<strong>{{ seat.name || "Open seat" }}</strong>
				<small v-if="seat.owner">Session owner</small>
				<small v-else-if="seat.bot">Bot drafter</small>
				<small v-else>{{ seat.name ? "Player" : "Awaiting player" }}</small>
			</article>
		</div>

		<div class="gulchdale-lobby__controls">
			<div v-if="isOwner" class="gulchdale-lobby__setting">
				<label for="gulchdale-bots">Bots</label>
				<div class="gulchdale-stepper">
					<button type="button" :disabled="bots <= 0" @click="$emit('update:bots', bots - 1)">−</button>
					<output id="gulchdale-bots">{{ bots }}</output>
					<button
						type="button"
						:disabled="occupiedSeats >= maxPlayers"
						@click="$emit('update:bots', bots + 1)"
					>
						+
					</button>
				</div>
			</div>
			<div v-if="isOwner" class="gulchdale-lobby__setting">
				<label for="gulchdale-timer">Pick timer</label>
				<select
					id="gulchdale-timer"
					:value="timer"
					@change="$emit('update:timer', Number(($event.target as HTMLSelectElement).value))"
				>
					<option :value="0">Untimed</option>
					<option :value="30">30 seconds</option>
					<option :value="45">45 seconds</option>
					<option :value="60">60 seconds</option>
					<option :value="90">90 seconds</option>
				</select>
			</div>
			<div class="gulchdale-lobby__actions">
				<button v-if="isOwner" type="button" class="secondary" @click="$emit('ready-check')">
					Ready check
				</button>
				<button
					v-if="isOwner"
					type="button"
					class="primary"
					:disabled="occupiedSeats < 2"
					@click="$emit('start')"
				>
					Begin draft
				</button>
				<p v-else>Waiting for the session owner to begin.</p>
			</div>
		</div>
	</section>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import QRCode from "qrcode";

type LobbyUser = { userID: string; userName: string };

export default defineComponent({
	name: "GulchdaleLobby",
	data: () => ({ qrCode: "" }),
	props: {
		bots: { type: Number, required: true },
		environmentName: { type: String, required: true },
		environmentVersion: { type: String, required: true },
		isOwner: { type: Boolean, required: true },
		maxPlayers: { type: Number, required: true },
		sessionID: { type: String, required: true },
		sessionOwner: { type: String, default: "" },
		timer: { type: Number, required: true },
		users: { type: Array as PropType<LobbyUser[]>, required: true },
	},
	emits: ["ready-check", "share", "start", "update:bots", "update:timer"],
	mounted() {
		void this.renderQRCode();
	},
	watch: {
		sessionID() {
			void this.renderQRCode();
		},
	},
	methods: {
		async renderQRCode() {
			const invitation = `${window.location.origin}/join/${encodeURIComponent(this.inviteCode)}`;
			this.qrCode = await QRCode.toDataURL(invitation, {
				width: 112,
				margin: 1,
				color: { dark: "#071315", light: "#e6f5f2" },
			});
		},
	},
	computed: {
		inviteCode(): string {
			return this.sessionID || window.location.pathname.split("/").filter(Boolean).at(-1) || "";
		},
		occupiedSeats(): number {
			return this.users.length + this.bots;
		},
		seats(): Array<{ index: number; name: string; owner: boolean; bot: boolean }> {
			const players = this.users.map((user) => ({
				name: user.userName,
				owner: user.userID === this.sessionOwner,
				bot: false,
			}));
			const bots = Array.from({ length: this.bots }, (_, index) => ({
				name: `Bot ${index + 1}`,
				owner: false,
				bot: true,
			}));
			return Array.from({ length: this.maxPlayers }, (_, index) => ({
				index,
				...(players[index] ?? bots[index - players.length] ?? { name: "", owner: false, bot: false }),
			}));
		},
	},
});
</script>

<style scoped>
.gulchdale-lobby {
	width: min(76rem, calc(100% - 2rem));
	margin: 1.5rem auto 3rem;
	padding: clamp(1rem, 3vw, 2rem);
	box-sizing: border-box;
	border: 1px solid rgba(113, 224, 225, 0.22);
	border-radius: 1.2rem;
	background: linear-gradient(145deg, rgba(5, 17, 20, 0.92), rgba(17, 14, 10, 0.9));
	box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.45);
}
.gulchdale-lobby__header {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	align-items: flex-start;
	text-align: left;
}
.gulchdale-lobby__kicker {
	margin: 0;
	color: #75dfe2;
	text-transform: uppercase;
	letter-spacing: 0.14em;
	font-size: 0.72rem;
}
h1 {
	margin: 0.25rem 0;
	color: #f1d287;
	font-family: Georgia, serif;
	font-size: clamp(2rem, 4vw, 3rem);
}
.gulchdale-lobby__header p {
	color: #aebfc0;
}
.gulchdale-lobby__code {
	display: flex;
	align-items: center;
	gap: 0.8rem;
	padding: 0.65rem 0.8rem;
	text-align: center;
	border: 1px solid rgba(240, 205, 123, 0.28);
	border-radius: 0.8rem;
	background: rgba(0, 0, 0, 0.28);
}
.gulchdale-lobby__code img {
	width: 4.5rem;
	height: 4.5rem;
	border-radius: 0.3rem;
}
.gulchdale-lobby__code span {
	display: block;
	color: #9eb1b2;
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.12em;
}
.gulchdale-lobby__code strong {
	display: block;
	margin: 0.25rem 0;
	color: #f3d58f;
	font-size: 1.55rem;
	letter-spacing: 0.18em;
}
.gulchdale-lobby__code button {
	border: 0;
	color: #7ce2e4;
	background: transparent;
	cursor: pointer;
}
.gulchdale-lobby__seats {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 0.7rem;
	margin: 1.5rem 0;
}
.gulchdale-seat {
	position: relative;
	min-height: 5.2rem;
	padding: 0.85rem 0.8rem 0.75rem 2.55rem;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 0.75rem;
	text-align: left;
	background: rgba(4, 10, 11, 0.58);
}
.gulchdale-seat.occupied {
	border-color: rgba(80, 204, 208, 0.3);
	background: linear-gradient(135deg, rgba(9, 40, 42, 0.78), rgba(12, 17, 16, 0.8));
}
.gulchdale-seat__number {
	position: absolute;
	left: 0.8rem;
	top: 0.8rem;
	color: #738889;
}
.gulchdale-seat__ember {
	position: absolute;
	left: 1rem;
	bottom: 0.75rem;
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 50%;
	background: #3c4e4e;
}
.occupied .gulchdale-seat__ember {
	background: #e9a94a;
	box-shadow: 0 0 1rem #d6792b;
}
.gulchdale-seat strong,
.gulchdale-seat small {
	display: block;
}
.gulchdale-seat strong {
	color: #e8f1f1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.gulchdale-seat small {
	margin-top: 0.3rem;
	color: #8fa5a6;
}
.gulchdale-lobby__controls {
	display: flex;
	align-items: end;
	gap: 1rem;
	padding-top: 1rem;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.gulchdale-lobby__setting {
	text-align: left;
}
.gulchdale-lobby__setting label {
	display: block;
	margin: 0 0 0.4rem;
	color: #aebfc0;
	font-size: 0.8rem;
}
.gulchdale-stepper {
	display: flex;
	align-items: center;
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 999px;
	overflow: hidden;
}
.gulchdale-stepper button {
	width: 2.5rem;
	height: 2.35rem;
	border: 0;
	color: #dff;
	background: #132326;
}
.gulchdale-stepper output {
	min-width: 2rem;
	text-align: center;
}
select {
	min-height: 2.4rem;
	border: 1px solid rgba(255, 255, 255, 0.14);
	border-radius: 0.5rem;
	color: #e6f0f0;
	background: #132326;
}
.gulchdale-lobby__actions {
	margin-left: auto;
	display: flex;
	align-items: center;
	gap: 0.7rem;
}
.gulchdale-lobby__actions button {
	min-height: 2.7rem;
	padding: 0.65rem 1.2rem;
	border-radius: 999px;
	font-weight: 700;
}
.primary {
	color: #061011;
	border: 1px solid #8be7e3;
	background: linear-gradient(135deg, #9cebe3, #43b7c0);
}
.secondary {
	color: #eed083;
	border: 1px solid rgba(238, 208, 131, 0.48);
	background: transparent;
}
button:focus-visible,
select:focus-visible {
	outline: 3px solid #75dfe2;
	outline-offset: 2px;
}
@media (max-width: 800px) {
	.gulchdale-lobby__seats {
		grid-template-columns: repeat(2, 1fr);
	}
	.gulchdale-lobby__controls {
		flex-wrap: wrap;
	}
	.gulchdale-lobby__actions {
		width: 100%;
		margin-left: 0;
		justify-content: flex-end;
	}
}
@media (max-width: 520px) {
	.gulchdale-lobby__header {
		display: block;
	}
	.gulchdale-lobby__code {
		margin-top: 1rem;
	}
	.gulchdale-lobby__seats {
		grid-template-columns: 1fr;
	}
	.gulchdale-lobby__actions {
		display: grid;
	}
	.gulchdale-lobby__actions button {
		width: 100%;
	}
}
</style>
