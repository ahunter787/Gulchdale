<template>
	<main class="gulchdale-landing" :style="{ backgroundImage: `url(${backdrop})` }">
		<div class="gulchdale-landing__veil"></div>
		<section class="gulchdale-landing__content" aria-labelledby="gulchdale-title">
			<img class="gulchdale-landing__logo" src="/img/gulchdale-logo.png" alt="Gulchdale" />
			<p class="gulchdale-landing__eyebrow">A shared-world Commander Cube draft</p>
			<h1 id="gulchdale-title">Gather at the edge of the wilds.</h1>
			<p class="gulchdale-landing__intro">
				Host a table for up to eight players, or follow an invitation into an existing draft.
			</p>

			<div class="gulchdale-landing__actions">
				<button class="gulchdale-primary" :disabled="busy !== ''" @click="hostDraft">
					{{ busy === "host" ? "Setting camp…" : "Host Draft" }}
				</button>
				<button class="gulchdale-secondary" :aria-expanded="showJoin" @click="showJoin = !showJoin">
					Join Draft
				</button>
			</div>

			<form v-if="showJoin" class="gulchdale-landing__join" @submit.prevent="joinDraft">
				<label for="gulchdale-session-code">Invitation code</label>
				<div>
					<input
						id="gulchdale-session-code"
						ref="joinInput"
						v-model="joinCode"
						inputmode="text"
						maxlength="6"
						pattern="[A-Za-z0-9]{6}"
						autocomplete="off"
						placeholder="ABC234"
						required
					/>
					<button
						class="gulchdale-primary"
						:disabled="busy !== '' || normalizedCode.length !== 6"
						type="submit"
					>
						{{ busy === "join" ? "Finding table…" : "Enter" }}
					</button>
				</div>
			</form>

			<p v-if="error" class="gulchdale-landing__error" role="alert">{{ error }}</p>
			<p class="gulchdale-landing__version" v-if="environment">
				{{ environment.displayName }} · {{ environment.version }}
			</p>
		</section>

		<footer>
			<span>
				Gulchdale is Powered by
				<a href="https://github.com/sponsors/Senryoku" target="_blank" rel="noopener">Draftmancer</a>
			</span>
			<LegalPopover />
		</footer>
	</main>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import LegalPopover from "./LegalPopover.vue";

type LandingEnvironment = { displayName: string; version: string };

export default defineComponent({
	name: "GulchdaleLanding",
	components: { LegalPopover },
	data: () => ({
		busy: "" as "" | "host" | "join",
		error: "",
		showJoin: false,
		joinCode: "",
		environment: null as LandingEnvironment | null,
		backdrop: "/img/gulchdale-landing.jpg",
	}),
	computed: {
		normalizedCode(): string {
			return this.joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
		},
	},
	watch: {
		showJoin(value: boolean) {
			if (value) this.$nextTick(() => (this.$refs.joinInput as HTMLInputElement | undefined)?.focus());
		},
		joinCode() {
			this.joinCode = this.normalizedCode;
			this.error = "";
		},
	},
	async mounted() {
		try {
			const response = await fetch("/api/gulchdale/config");
			if (response.ok) {
				const config = (await response.json()) as {
					environment: LandingEnvironment & { branding?: { backdrop?: string } };
				};
				this.environment = config.environment;
				this.backdrop = config.environment.branding?.backdrop ?? this.backdrop;
			}
		} catch {
			// The landing page remains useful while the server reconnects.
		}
	},
	methods: {
		async hostDraft() {
			this.busy = "host";
			this.error = "";
			try {
				const response = await fetch("/api/gulchdale/sessions", { method: "POST" });
				if (!response.ok) throw new Error("Gulchdale could not prepare a table.");
				const { joinPath } = (await response.json()) as { joinPath: string };
				window.location.assign(joinPath);
			} catch (error) {
				this.error = error instanceof Error ? error.message : "Gulchdale could not prepare a table.";
				this.busy = "";
			}
		},
		async joinDraft() {
			this.busy = "join";
			this.error = "";
			try {
				const response = await fetch(`/api/gulchdale/sessions/${encodeURIComponent(this.normalizedCode)}`);
				const result = (await response.json()) as { available?: boolean; reason?: string };
				if (!response.ok || !result.available)
					throw new Error(result.reason ?? "That invitation is unavailable.");
				window.location.assign(`/join/${this.normalizedCode}`);
			} catch (error) {
				this.error = error instanceof Error ? error.message : "That invitation is unavailable.";
				this.busy = "";
			}
		},
	},
});
</script>

<style scoped>
.gulchdale-landing {
	min-height: 100vh;
	position: relative;
	display: grid;
	place-items: center;
	box-sizing: border-box;
	padding: clamp(1.25rem, 4vw, 4rem);
	background-color: #071014;
	background-position: center;
	background-size: cover;
	background-repeat: no-repeat;
	background-attachment: fixed;
	color: #edf9fa;
	overflow: hidden;
}
.gulchdale-landing__veil {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(circle at 50% 40%, rgba(22, 160, 174, 0.12), transparent 32%),
		linear-gradient(90deg, rgba(2, 8, 11, 0.86), rgba(4, 13, 16, 0.38) 52%, rgba(2, 8, 11, 0.82));
}
.gulchdale-landing__content {
	position: relative;
	z-index: 1;
	width: min(46rem, 100%);
	text-align: center;
	padding: clamp(1.5rem, 5vw, 3.5rem);
	border: 1px solid rgba(112, 226, 229, 0.25);
	border-radius: 1.25rem;
	background: rgba(3, 12, 15, 0.78);
	box-shadow:
		0 2rem 7rem rgba(0, 0, 0, 0.58),
		inset 0 1px rgba(255, 255, 255, 0.06);
	backdrop-filter: blur(12px);
}
.gulchdale-landing__logo {
	width: min(31rem, 90%);
	max-height: 9rem;
	object-fit: contain;
}
.gulchdale-landing__eyebrow {
	color: #76e5e7;
	text-transform: uppercase;
	letter-spacing: 0.16em;
	font-size: 0.75rem;
}
h1 {
	margin: 0.55rem 0;
	font-family: Georgia, serif;
	color: #f2d183;
	font-size: clamp(2rem, 5vw, 3.75rem);
	line-height: 1.05;
}
.gulchdale-landing__intro {
	margin: 1rem auto 2rem;
	max-width: 36rem;
	color: #c5d5d5;
	line-height: 1.6;
}
.gulchdale-landing__actions {
	display: flex;
	justify-content: center;
	gap: 0.8rem;
	flex-wrap: wrap;
}
button {
	min-height: 3rem;
	padding: 0.75rem 1.45rem;
	border-radius: 999px;
	font-weight: 700;
	cursor: pointer;
}
.gulchdale-primary {
	color: #071012;
	border: 1px solid #9df4ef;
	background: linear-gradient(135deg, #a5f4e9, #43bdc7);
	box-shadow: 0 0 2rem rgba(67, 189, 199, 0.22);
}
.gulchdale-secondary {
	color: #f2d183;
	border: 1px solid rgba(242, 209, 131, 0.58);
	background: rgba(14, 18, 18, 0.72);
}
button:focus-visible,
input:focus-visible,
a:focus-visible {
	outline: 3px solid #8be9ec;
	outline-offset: 3px;
}
button:disabled {
	opacity: 0.55;
	cursor: wait;
}
.gulchdale-landing__join {
	margin: 1.5rem auto 0;
	max-width: 26rem;
	text-align: left;
}
.gulchdale-landing__join label {
	display: block;
	margin: 0 0 0.45rem 0.75rem;
	color: #c6d7d6;
}
.gulchdale-landing__join > div {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.55rem;
}
.gulchdale-landing__join input {
	min-width: 0;
	border: 1px solid rgba(118, 229, 231, 0.45);
	border-radius: 999px;
	padding: 0.75rem 1rem;
	background: #081417;
	color: white;
	text-transform: uppercase;
	letter-spacing: 0.22em;
	font-size: 1.1rem;
}
.gulchdale-landing__error {
	color: #ffada5;
	margin: 1rem 0 0;
}
.gulchdale-landing__version {
	color: #8da5a6;
	font-size: 0.78rem;
	margin: 1.5rem 0 0;
}
footer {
	position: absolute;
	z-index: 1;
	bottom: 1rem;
	display: flex;
	gap: 0.6rem;
	color: #9db0b1;
	font-size: 0.8rem;
}
footer a {
	color: #bee8e6;
}
@media (max-width: 560px) {
	.gulchdale-landing {
		padding: 0.75rem;
		align-items: center;
	}
	.gulchdale-landing__content {
		padding: 1.5rem 1rem;
	}
	.gulchdale-landing__actions {
		display: grid;
	}
	.gulchdale-landing__join > div {
		grid-template-columns: 1fr;
	}
	footer {
		position: relative;
		margin-top: 1rem;
	}
}
@media (prefers-reduced-motion: reduce) {
	* {
		scroll-behavior: auto !important;
		transition: none !important;
	}
}
</style>
