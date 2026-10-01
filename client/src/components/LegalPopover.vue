<template>
	<div
		ref="root"
		class="gulchdale-legal-popover"
		@mouseenter="handlePointerEnter"
		@mouseleave="handlePointerLeave"
		@focusin="openPopover"
		@focusout="scheduleClose"
		@keydown.esc.stop.prevent="closeAndFocus"
	>
		<button
			:id="triggerID"
			ref="trigger"
			type="button"
			class="gulchdale-legal-popover__trigger"
			aria-haspopup="dialog"
			:aria-expanded="open ? 'true' : 'false'"
			:aria-controls="panelID"
			@click="handleClick"
		>
			About &amp; legal
		</button>
		<transition name="legal-popover">
			<section
				v-show="open"
				:id="panelID"
				class="gulchdale-legal-popover__panel"
				role="dialog"
				aria-modal="false"
				:aria-labelledby="triggerID"
			>
				<About />
			</section>
		</transition>
	</div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import About from "./About.vue";

let nextPopoverID = 0;

export default defineComponent({
	name: "LegalPopover",
	components: { About },
	data() {
		const id = ++nextPopoverID;
		return {
			open: false,
			pointerInside: false,
			touchOnly: false,
			closeTimer: undefined as ReturnType<typeof setTimeout> | undefined,
			panelID: `gulchdale-legal-panel-${id}`,
			triggerID: `gulchdale-legal-trigger-${id}`,
		};
	},
	mounted() {
		this.touchOnly = window.matchMedia("(hover: none), (pointer: coarse)").matches;
		document.addEventListener("pointerdown", this.handleOutsidePointer);
	},
	beforeUnmount() {
		this.cancelClose();
		document.removeEventListener("pointerdown", this.handleOutsidePointer);
	},
	methods: {
		openPopover() {
			this.cancelClose();
			this.open = true;
		},
		handlePointerEnter() {
			this.pointerInside = true;
			if (!this.touchOnly) this.openPopover();
		},
		handlePointerLeave() {
			this.pointerInside = false;
			this.scheduleClose();
		},
		handleClick() {
			if (this.touchOnly) this.open = !this.open;
			else this.openPopover();
		},
		handleOutsidePointer(event: PointerEvent) {
			if (!this.touchOnly || !this.open) return;
			const root = this.$refs.root as HTMLElement | undefined;
			if (root && !root.contains(event.target as Node)) this.open = false;
		},
		scheduleClose() {
			this.cancelClose();
			this.closeTimer = setTimeout(() => {
				const root = this.$refs.root as HTMLElement | undefined;
				if (!this.pointerInside && root && !root.contains(document.activeElement)) this.open = false;
			}, 140);
		},
		cancelClose() {
			if (this.closeTimer) clearTimeout(this.closeTimer);
			this.closeTimer = undefined;
		},
		closeAndFocus() {
			this.open = false;
			(this.$refs.trigger as HTMLButtonElement | undefined)?.focus();
		},
	},
});
</script>

<style scoped>
.gulchdale-legal-popover {
	position: relative;
	display: inline-flex;
}
.gulchdale-legal-popover__trigger {
	min-height: 0;
	padding: 0;
	border: 0;
	border-radius: 0;
	color: #9db0b1;
	background: transparent;
	font: inherit;
	text-decoration: underline;
	cursor: help;
}
.gulchdale-legal-popover__trigger:focus-visible {
	outline: 3px solid #75dfe2;
	outline-offset: 3px;
}
.gulchdale-legal-popover__panel {
	position: absolute;
	z-index: 1100;
	right: 0;
	bottom: calc(100% + 0.65rem);
	width: min(34rem, calc(100vw - 2rem));
	box-sizing: border-box;
	padding: 0.9rem 1rem;
	border: 1px solid rgba(112, 226, 229, 0.3);
	border-radius: 0.7rem;
	background: rgba(3, 12, 15, 0.98);
	box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.62);
	color: #c5d5d5;
	line-height: 1.45;
	text-align: left;
}
.legal-popover-enter-active,
.legal-popover-leave-active {
	transition:
		opacity 120ms ease,
		transform 120ms ease;
}
.legal-popover-enter-from,
.legal-popover-leave-to {
	opacity: 0;
	transform: translateY(0.25rem);
}
@media (max-width: 560px) {
	.gulchdale-legal-popover__panel {
		position: fixed;
		left: 0.5rem;
		right: 0.5rem;
		bottom: 3.5rem;
		width: auto;
		max-height: calc(100vh - 5rem);
		overflow-y: auto;
	}
}
@media (prefers-reduced-motion: reduce) {
	.legal-popover-enter-active,
	.legal-popover-leave-active {
		transition: none;
	}
}
</style>
