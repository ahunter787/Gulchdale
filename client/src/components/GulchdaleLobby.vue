<template>
	<section class="gulchdale-lobby" aria-labelledby="lobby-title">
		<header class="gulchdale-lobby__header">
			<div>
				<p class="gulchdale-lobby__kicker">Campfire lobby</p>
				<h1 id="lobby-title">Gather your party</h1>
				<p>{{ environmentName }} <span aria-hidden="true">·</span> {{ environmentVersion }}</p>
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

		<div
			class="gulchdale-campfire"
			:style="{ backgroundImage: `url(${lobbyBackdrop})` }"
			:aria-label="`${occupiedSeats} of ${maxPlayers} seats occupied`"
		>
			<div class="gulchdale-campfire__glow" aria-hidden="true"></div>
			<div class="gulchdale-campfire__embers" aria-hidden="true">
				<i v-for="ember in 8" :key="ember"></i>
			</div>
			<ol class="gulchdale-campfire__seats">
				<li
					v-for="seat in seats"
					:key="seat.key"
					class="gulchdale-seat"
					:class="[
						`gulchdale-seat--${seat.index + 1}`,
						{
							'gulchdale-seat--occupied': seat.name,
							'gulchdale-seat--owner': seat.owner,
							'gulchdale-seat--bot': seat.bot,
							'gulchdale-seat--ready': seat.ready,
							'gulchdale-seat--disconnected': seat.disconnected,
							'gulchdale-seat--mirrored': seat.mirrored,
							[`gulchdale-seat--${seat.pose}`]: true,
						},
					]"
				>
					<img
						v-if="seat.name && seat.artwork"
						class="gulchdale-seat__traveler"
						:src="seat.artwork"
						alt=""
						aria-hidden="true"
					/>
					<div v-else class="gulchdale-seat__empty" aria-hidden="true"><i></i></div>
					<div class="gulchdale-seat__nameplate">
						<span class="gulchdale-seat__number">{{ seat.index + 1 }}</span>
						<strong>{{ seat.name || "Open seat" }}</strong>
						<small>{{ seat.status }}</small>
					</div>
				</li>
			</ol>
		</div>

		<div class="gulchdale-lobby__controls">
			<div v-if="isOwner" class="gulchdale-lobby__setting">
				<label for="gulchdale-bots">Bots</label>
				<div class="gulchdale-stepper">
					<button
						type="button"
						aria-label="Remove a bot"
						:disabled="bots <= 0"
						@click="$emit('update:bots', bots - 1)"
					>
						−
					</button>
					<output id="gulchdale-bots">{{ bots }}</output>
					<button
						type="button"
						aria-label="Add a bot"
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
import { buildCampfireSeats, CampfireSeat, DisconnectedUsers, LobbyUser } from "../gulchdaleLobby";

export default defineComponent({
	name: "GulchdaleLobby",
	data: () => ({ qrCode: "" }),
	props: {
		bots: { type: Number, required: true },
		disconnectedUsers: { type: Object as PropType<DisconnectedUsers>, default: () => ({}) },
		environmentName: { type: String, required: true },
		environmentVersion: { type: String, required: true },
		isOwner: { type: Boolean, required: true },
		lobbyBackdrop: { type: String, required: true },
		maxPlayers: { type: Number, required: true },
		seatedTravelerSilhouette: { type: String, default: "" },
		seatTravelerSilhouettes: { type: Array as PropType<string[]>, default: () => [] },
		sessionID: { type: String, required: true },
		sessionOwner: { type: String, default: "" },
		timer: { type: Number, required: true },
		travelerSilhouettes: { type: Array as PropType<string[]>, default: () => [] },
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
			this.qrCode = await QRCode.toDataURL(
				`${window.location.origin}/join/${encodeURIComponent(this.inviteCode)}`,
				{ width: 112, margin: 1, color: { dark: "#071315", light: "#e6f5f2" } }
			);
		},
	},
	computed: {
		inviteCode(): string {
			return this.sessionID || window.location.pathname.split("/").filter(Boolean).at(-1) || "";
		},
		occupiedSeats(): number {
			return this.users.length + Object.keys(this.disconnectedUsers).length + this.bots;
		},
		seats(): CampfireSeat[] {
			return buildCampfireSeats({
				users: this.users,
				disconnectedUsers: this.disconnectedUsers,
				bots: this.bots,
				maxPlayers: this.maxPlayers,
				sessionOwner: this.sessionOwner,
				seatedTravelerSilhouette: this.seatedTravelerSilhouette,
				seatTravelerSilhouettes: this.seatTravelerSilhouettes,
				travelerSilhouettes: this.travelerSilhouettes,
			});
		},
	},
});
</script>

<style scoped>
.gulchdale-lobby {
	width: min(88rem, calc(100% - 2rem));
	margin: 1rem auto 3rem;
	color: #e8f1f1;
}
.gulchdale-lobby__header,
.gulchdale-lobby__controls {
	position: relative;
	z-index: 5;
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1rem 1.25rem;
	border: 1px solid rgba(113, 224, 225, 0.2);
	background: rgba(3, 12, 15, 0.9);
	box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.36);
	backdrop-filter: blur(12px);
}
.gulchdale-lobby__header {
	justify-content: space-between;
	border-radius: 1rem 1rem 0 0;
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
	margin: 0.15rem 0;
	color: #f1d287;
	font-family: Georgia, serif;
	font-size: clamp(1.8rem, 4vw, 3rem);
}
.gulchdale-lobby__header p {
	margin: 0;
	color: #aebfc0;
}
.gulchdale-lobby__code {
	display: flex;
	align-items: center;
	gap: 0.8rem;
	padding: 0.5rem 0.75rem;
	text-align: center;
	border: 1px solid rgba(240, 205, 123, 0.28);
	border-radius: 0.8rem;
	background: rgba(0, 0, 0, 0.28);
}
.gulchdale-lobby__code img {
	width: 4rem;
	height: 4rem;
	border-radius: 0.3rem;
}
.gulchdale-lobby__code span,
.gulchdale-seat small {
	display: block;
	color: #9eb1b2;
	font-size: 0.7rem;
}
.gulchdale-lobby__code span {
	text-transform: uppercase;
	letter-spacing: 0.12em;
}
.gulchdale-lobby__code strong {
	display: block;
	margin: 0.15rem 0;
	color: #f3d58f;
	font-size: 1.4rem;
	letter-spacing: 0.18em;
}
.gulchdale-lobby__code button {
	border: 0;
	color: #7ce2e4;
	background: transparent;
	cursor: pointer;
}
.gulchdale-campfire {
	position: relative;
	min-height: clamp(31rem, 52vw, 47rem);
	overflow: hidden;
	background-color: #071014;
	background-position: center;
	background-size: cover;
	box-shadow: inset 0 0 5rem rgba(0, 0, 0, 0.5);
}
.gulchdale-campfire::after {
	content: "";
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: linear-gradient(180deg, rgba(2, 8, 12, 0.12), transparent 40%, rgba(2, 8, 10, 0.4));
}
.gulchdale-campfire__glow {
	position: absolute;
	z-index: 1;
	left: 50%;
	top: 61%;
	width: 26%;
	aspect-ratio: 1;
	transform: translate(-50%, -50%);
	border-radius: 50%;
	background: radial-gradient(circle, rgba(255, 171, 62, 0.3), rgba(255, 103, 22, 0.08) 42%, transparent 70%);
	animation: campfire-pulse 3.4s ease-in-out infinite alternate;
}
.gulchdale-campfire__embers,
.gulchdale-campfire__seats {
	position: absolute;
	inset: 0;
	margin: 0;
	padding: 0;
	list-style: none;
}
.gulchdale-campfire__embers {
	z-index: 2;
	pointer-events: none;
}
.gulchdale-campfire__embers i {
	position: absolute;
	left: calc(48% + var(--drift, 0%));
	top: 65%;
	width: 0.3rem;
	height: 0.3rem;
	border-radius: 50%;
	background: #ffc05d;
	box-shadow: 0 0 0.6rem #ff8127;
	animation: ember-rise 3.8s linear infinite;
}
.gulchdale-campfire__embers i:nth-child(2n) {
	--drift: 4%;
	animation-delay: -1.2s;
}
.gulchdale-campfire__embers i:nth-child(3n) {
	--drift: -3%;
	animation-delay: -2.4s;
}
.gulchdale-campfire__embers i:nth-child(4n) {
	--drift: 7%;
	animation-delay: -3.1s;
}
.gulchdale-seat {
	position: absolute;
	z-index: 3;
	width: 15%;
	height: 27%;
	min-width: 8rem;
	pointer-events: none;
	filter: drop-shadow(0 1rem 1rem rgba(0, 0, 0, 0.7));
}
.gulchdale-seat--1 {
	left: 4%;
	top: 35%;
	height: 35%;
	z-index: 4;
}
.gulchdale-seat--2 {
	left: 20%;
	top: 36%;
}
.gulchdale-seat--3 {
	left: 34%;
	top: 29%;
	--avatar-scale: 0.84;
}
.gulchdale-seat--4 {
	right: 34%;
	top: 29%;
	--avatar-scale: 0.84;
}
.gulchdale-seat--5 {
	right: 20%;
	top: 36%;
}
.gulchdale-seat--6 {
	right: 4%;
	top: 35%;
	height: 35%;
	z-index: 4;
}
.gulchdale-seat--7 {
	left: 30%;
	top: 61%;
	height: 24%;
	--avatar-scale: 1.05;
	z-index: 5;
}
.gulchdale-seat--8 {
	right: 30%;
	top: 61%;
	height: 24%;
	--avatar-scale: 1.05;
	z-index: 5;
}
.gulchdale-seat__traveler {
	position: absolute;
	left: 50%;
	bottom: 2.4rem;
	width: auto;
	height: 100%;
	max-width: 145%;
	pointer-events: none;
	object-fit: contain;
	transform: translateX(-50%) scale(var(--avatar-scale, 1));
	transform-origin: bottom center;
	transition:
		filter 180ms ease,
		opacity 180ms ease,
		transform 180ms ease;
}
.gulchdale-seat--seated .gulchdale-seat__traveler {
	height: 76%;
	max-width: 165%;
}
.gulchdale-seat--mirrored .gulchdale-seat__traveler {
	transform: translateX(-50%) scaleX(-1) scale(var(--avatar-scale, 1));
}
.gulchdale-seat--bot .gulchdale-seat__traveler {
	filter: saturate(0.7) hue-rotate(145deg) drop-shadow(0 0 0.7rem rgba(92, 221, 229, 0.5));
}
.gulchdale-seat--disconnected .gulchdale-seat__traveler {
	opacity: 0.35;
	filter: grayscale(0.8);
}
.gulchdale-seat__empty {
	position: absolute;
	left: 50%;
	bottom: 3rem;
	width: 2.3rem;
	height: 2.3rem;
	transform: translateX(-50%);
	border: 1px solid rgba(120, 226, 228, 0.22);
	border-radius: 50%;
	background: rgba(4, 14, 16, 0.54);
}
.gulchdale-seat__empty i {
	position: absolute;
	left: 50%;
	top: 50%;
	width: 0.55rem;
	height: 0.55rem;
	transform: translate(-50%, -50%);
	border-radius: 50%;
	background: #597071;
	box-shadow: 0 0 0.8rem rgba(74, 203, 208, 0.35);
}
.gulchdale-seat__nameplate {
	position: absolute;
	left: 50%;
	bottom: 0;
	width: min(12rem, 130%);
	box-sizing: border-box;
	transform: translateX(-50%);
	padding: 0.38rem 0.55rem;
	border: 1px solid rgba(114, 220, 222, 0.22);
	border-radius: 0.5rem;
	background: rgba(3, 10, 12, 0.86);
	text-align: center;
	box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.4);
}
.gulchdale-seat__number {
	position: absolute;
	left: 0.38rem;
	top: 0.35rem;
	color: #6f898a;
	font-size: 0.68rem;
}
.gulchdale-seat strong {
	display: block;
	overflow: hidden;
	color: #e8f1f1;
	font-size: clamp(0.72rem, 1vw, 0.92rem);
	text-overflow: ellipsis;
	white-space: nowrap;
}
.gulchdale-seat--owner .gulchdale-seat__nameplate {
	border-color: rgba(242, 208, 126, 0.68);
	box-shadow: 0 0 1.2rem rgba(227, 161, 55, 0.26);
}
.gulchdale-seat--ready .gulchdale-seat__nameplate {
	background: rgba(6, 37, 39, 0.9);
	border-color: rgba(103, 226, 226, 0.58);
}
.gulchdale-seat--disconnected .gulchdale-seat__nameplate {
	border-style: dashed;
	opacity: 0.78;
}
.gulchdale-lobby__controls {
	align-items: end;
	border-radius: 0 0 1rem 1rem;
}
.gulchdale-lobby__setting {
	text-align: left;
}
.gulchdale-lobby__setting label {
	display: block;
	margin: 0 0 0.35rem;
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
.gulchdale-lobby__actions p {
	color: #aebfc0;
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
@keyframes campfire-pulse {
	to {
		transform: translate(-50%, -50%) scale(1.12);
		opacity: 0.78;
	}
}
@keyframes ember-rise {
	0% {
		transform: translate(0, 0) scale(0.55);
		opacity: 0;
	}
	18% {
		opacity: 0.9;
	}
	100% {
		transform: translate(1rem, -8rem) scale(0);
		opacity: 0;
	}
}
@media (max-width: 900px) {
	.gulchdale-campfire {
		min-height: 36rem;
	}
	.gulchdale-seat {
		width: 17%;
		height: 26%;
		min-width: 6.5rem;
	}
	.gulchdale-seat__nameplate {
		width: 110%;
	}
	.gulchdale-seat--1 {
		left: 0;
		height: 32%;
	}
	.gulchdale-seat--2 {
		left: 19%;
		top: 37%;
	}
	.gulchdale-seat--3 {
		left: 31%;
		top: 30%;
	}
	.gulchdale-seat--4 {
		right: 31%;
		top: 30%;
	}
	.gulchdale-seat--5 {
		right: 19%;
		top: 37%;
	}
	.gulchdale-seat--6 {
		right: 0;
		height: 32%;
	}
	.gulchdale-seat--7 {
		left: 23%;
		top: 62%;
		height: 23%;
	}
	.gulchdale-seat--8 {
		right: 23%;
		top: 62%;
		height: 23%;
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
@media (max-width: 620px) {
	.gulchdale-lobby {
		width: calc(100% - 1rem);
	}
	.gulchdale-lobby__header {
		display: block;
	}
	.gulchdale-lobby__code {
		margin-top: 0.8rem;
		justify-content: center;
	}
	.gulchdale-campfire {
		min-height: 39rem;
		padding: 9rem 0.6rem 0.8rem;
		box-sizing: border-box;
		background-position: 50% top;
	}
	.gulchdale-campfire__glow,
	.gulchdale-campfire__embers {
		display: none;
	}
	.gulchdale-campfire::after {
		background: linear-gradient(180deg, transparent 10%, rgba(2, 8, 10, 0.78) 33%);
	}
	.gulchdale-campfire__seats {
		position: relative;
		z-index: 4;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.gulchdale-seat,
	.gulchdale-seat--1,
	.gulchdale-seat--2,
	.gulchdale-seat--3,
	.gulchdale-seat--4,
	.gulchdale-seat--5,
	.gulchdale-seat--6,
	.gulchdale-seat--7,
	.gulchdale-seat--8 {
		position: relative;
		left: auto;
		right: auto;
		top: auto;
		width: auto;
		height: 5.3rem;
		min-width: 0;
		filter: none;
	}
	.gulchdale-seat__traveler {
		left: 0.4rem;
		bottom: 0.35rem;
		height: 4.6rem;
		max-width: 3.8rem;
		transform: none;
	}
	.gulchdale-seat--seated .gulchdale-seat__traveler {
		left: -0.15rem;
		bottom: 0.45rem;
		width: 4.8rem;
		height: 4.4rem;
		max-width: none;
	}
	.gulchdale-seat--mirrored .gulchdale-seat__traveler {
		transform: scaleX(-1);
	}
	.gulchdale-seat__empty {
		left: 1.9rem;
		bottom: 1.5rem;
		transform: none;
	}
	.gulchdale-seat__nameplate {
		left: 0;
		bottom: 0;
		width: 100%;
		height: 100%;
		transform: none;
		padding: 1.25rem 0.4rem 0.4rem 5rem;
		text-align: left;
	}
	.gulchdale-seat__number {
		left: auto;
		right: 0.4rem;
	}
	.gulchdale-lobby__actions {
		display: grid;
	}
	.gulchdale-lobby__actions button {
		width: 100%;
	}
}
@media (max-width: 400px) {
	.gulchdale-campfire {
		min-height: 65rem;
	}
	.gulchdale-campfire__seats {
		grid-template-columns: 1fr;
	}
}
@media (prefers-reduced-motion: reduce) {
	.gulchdale-campfire__glow,
	.gulchdale-campfire__embers i {
		animation: none;
	}
	.gulchdale-seat__traveler {
		transition: none;
	}
}
</style>
