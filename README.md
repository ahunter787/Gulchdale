# Gulchdale

## Overhaul: preserve first

The governing design inputs are the [Design Charter](docs/architecture/DESIGN_CHARTER.md),
[Systems Map v1.0](docs/architecture/SYSTEMS_MAP_v1.0.md), and [overhaul conversation](https://chatgpt.com/share/6ac35a77-0d7c-83e8-855d-fa275c074182).
Gulchdale becomes the source of truth for releases, metadata, supply, orchestration,
weighting, telemetry and curation. Cube Cobra is an import/publishing integration;
Draftmancer remains the proven legacy draft engine behind a future narrow adapter.

Current decisions in [ADR-0009](docs/decisions/ADR-0009-new-game-and-integration-boundaries.md)
supersede conflicting original UI/passing assumptions: this is a distinct new game,
with immediate-resolution packs and new scene UI. Reviewed low-level card primitives
may be adapted; legacy screens are not design references. See the
[continuation technical proof](docs/CONTINUATION_TECHNICAL_PROOF.md) for phased validation.

The [overhaul roadmap](docs/roadmap.md) replaces the historical roadmap below:
Phase 0 preserve/audit; 1 PostgreSQL foundation; 2 pack simulator; 3 orchestrator;
4 thin adapter; 5 four-player vertical slice; 6 curation/releases; 7 telemetry;
8 player learning; 9 advanced systems; 10 buildability.
Repository Markdown is authoritative; Plane and Outline are synchronized mirrors.
Do not rewrite Draftmancer or tag the full cube. Legacy stays the default through
overhaul Phase 4 and until the vertical-slice acceptance gate passes.

The original Phase 1–3 documents and runtime remain legacy/as-built records.
The old [Phase 4 proposal](docs/PHASE4_MECHANICS.md) is superseded research, not an
implementation mandate: singleton applies to each final deck, not the whole draft.
Baseline: tag `gulchdale-legacy-v1.0.0`, commit `e766438`.

Start with the [legacy reproduction runbook](docs/LEGACY_BASELINE.md).
The separate [PostgreSQL foundation](docs/FOUNDATION.md) provides offline imports,
immutable releases, reviewed promotion and read-only inspection. It does not replace
legacy drafting. See the [architecture inventory](docs/architecture/LEGACY_INVENTORY.md)
and [accepted boundary decisions](docs/decisions/ADR-0003-domain-and-engine-boundary.md).

Overhaul Phases 0 and 1 are complete; see the [verified exit record](docs/OVERHAUL_PHASE_0_1_VERIFICATION.md).
Phase 2 is Building: GD-300-901 is approved, and GD-300-002 provides an isolated
headless pack simulator verified through 10,000 scenarios and their replays. See the [Phase 2 evidence](docs/OVERHAUL_PHASE_2.md)
and [independent-worker commands](docs/PHASE2_WORKER_HANDOFF.md). Real small-slice
content/balance review remains open. No live new-game flow, UI or full-cube tagging
has been implemented.
The [human-readable work catalog](docs/WORK_ITEMS.md) explains each module/ticket and
its remaining questions inside Plane and Outline. The tested legacy recovery point
is `gulchdale-legacy-preserved-v1.0.1`; see the legacy runbook before restoring.

Gulchdale is a standalone, Gulchdale-branded multiplayer Commander Cube drafting application. It is intended to turn the existing CubeCobra-to-Draftmancer workflow into a cohesive product: players visit Gulchdale, host or join a lobby, draft, review their pool, and export a deck without seeing Draftmancer configuration files or manually uploading a cube list.

## Historical product direction (legacy/as-built)

The app should begin as a self-hosted web application and installable PWA rather than an Electron desktop application. Draftmancer remains the proven drafting and multiplayer engine, but becomes an internal dependency instead of the visible product. CubeCobra remains the authoritative source for the cube, and the existing Python export logic evolves into a reusable Gulchdale compiler.

The intended player flow is:

```text
Gulchdale
  -> Host or join a draft
  -> Lobby and invite link
  -> Draft
  -> Commander selection and deck building
  -> Export or save the deck
```

The visual identity is a restrained dark-fantasy nighttime landscape: forest, campfire light, glowing mana, gold accents, and a game-launcher feel. The current `gulchdale_draft.html` and landing artwork are an early proof of concept, not the final architecture.

## System model

```text
CubeCobra (source of truth)
        |
        v
Gulchdale Compiler
  - reads cube data, tags, and notes
  - resolves card printings and metadata
  - builds sheets, layouts, custom cards, and draft effects
  - validates cross-references
  - emits an immutable, versioned environment
        |
        v
Draftmancer Engine
  - multiplayer sessions and reconnects
  - pack collation and passing
  - bots and draft state
  - custom-card parsing and effects
        |
        v
Gulchdale UI
  - landing page and lobby
  - Gulchdale-specific draft presentation
  - pool, commander selection, deck builder, and export
```

The authoritative CubeCobra cube ID is `f1c8be0f-7ac3-420f-81eb-ec8933ce45fa`.

Every compiled environment should receive a version or content hash. An active draft must remain pinned to the environment version with which it started, even if the CubeCobra list changes during the session.

## Gulchdale draft rules

The committed Phase 1 environment uses four predetermined stages, with two cards selected per pick:

| Stage                | Contents             |
| -------------------- | -------------------- |
| Pack 1               | 4 Commander, 16 Mono |
| Pack 2               | 2 Commander, 18 Mono |
| Pack 3               | 20 Mono              |
| Expedition/Land Pack | 20 Land              |

These values come directly from `data/cubes/gulchdale.txt` rather than being hard-coded into UI components. An earlier planning outline described separate Multicolor and Acceleration sheets, but those sheets are not present in the current generated snapshot.

## Existing custom mechanics

The current exporter and Draftmancer environment already encode behavior that must be preserved before refactoring:

- Cards tagged for draft effects become Draftmancer custom cards.
- A card's CubeCobra Notes lines identify cards or custom objects added to the drafter's pool.
- Partner-style relationships use `AddCards`, including Pako/Haldan, Gorm/Virtus, Pir/Toothy, and Shabraz/Brallin.
- Tribal booster objects use custom cards and `AddBooster`/`AddCards` behavior. Historical tribes include Elf, Zombie, Goblin, Faerie, and Human.
- Scryfall supplies card metadata and images when required by generated custom cards.
- Maybeboard entries must not enter the generated main cube environment.

Eventually, these effects should receive clear Gulchdale-specific feedback such as “Partner Found” or “Booster Unlocked,” while the engine continues to execute the underlying Draftmancer behavior.

## MVP

The first production milestone is a locally hosted, Gulchdale-branded instance that can run the existing Gulchdale environment through a forked or adapted Draftmancer engine.

For the MVP, players must be able to:

1. Visit the Gulchdale app.
2. Host a draft and receive an invite link or code.
3. Join from another device with a display name and no required account.
4. Enter a lobby, mark ready, and reconnect after a disconnect.
5. Draft the current cube with the configured packs and two-pick rule.
6. Correctly trigger existing custom-card, partner, and booster effects.
7. View the final drafted pool.
8. Export a decklist.

Players should not need to visit Draftmancer, paste a CubeCobra URL, or upload a generated Draftmancer list.

## Historical roadmap (superseded by the overhaul roadmap)

1. **Engine:** Host the current Gulchdale environment on an owned Draftmancer-based server while retaining the upstream UI where practical.
2. **Compiler:** Refactor the existing Python exporter into testable compile, validate, build, and version operations; remove manual CSV/TXT steps.
3. **Gulchdale UI:** Add the branded landing page, host/join flow, campfire lobby and table controls, responsive draft interface, and Gulchdale card presentation.
4. **Mechanics:** Give partner acquisition and tribal/custom boosters first-class visual feedback.
5. **Deck builder:** Add commander selection, color-identity guidance, deck/sideboard organization, and exports.
6. **Forge:** Add a private administration surface for CubeCobra sync, validation, environment rebuilds, version history, rollback, and test drafts.
7. **Persistence:** Later, optionally add accounts, draft/deck history, statistics, avatars, achievements, and analytics.

Release-hardening boundaries are recorded in [`docs/HARDENING.md`](docs/HARDENING.md). Phase 4 mechanics, singleton allocation, and presentation work are planned in [`docs/PHASE4_MECHANICS.md`](docs/PHASE4_MECHANICS.md).

## Engineering principles

- Preserve current Gulchdale behavior and add regression coverage before major refactors.
- Reuse proven Draftmancer functionality instead of rebuilding generic draft infrastructure.
- Keep Gulchdale-specific rules separate from the generic draft engine.
- Keep configuration and compiled cube data separate from presentation code.
- Keep active draft environments immutable.
- Design for responsive desktop/mobile use, Docker deployment, and a Linux-hosted server.
- Do not make authentication a prerequisite for the MVP.

## Running legacy Phase 1

Phase 1 runs the current Gulchdale environment on a self-hosted Draftmancer engine. The cube snapshot is bundled and locked, so normal users cannot replace its lists or pack rules.

```bash
docker compose up --build -d
```

Open `http://localhost:43721`, or use port `43721` on the host's LAN address from another device. Override the host port with `GULCHDALE_PORT` if needed. Runtime and troubleshooting details are in [`docs/PHASE1_ENGINE.md`](docs/PHASE1_ENGINE.md); upstream maintenance is documented in [`UPSTREAM.md`](UPSTREAM.md).

The original public-Draftmancer launcher remains available only as a historical prototype under `reference/prototype/`.

## Running the legacy Phase 2 compiler

Phase 2 adds a deterministic, explicitly promoted compiler. A build downloads the public CubeCobra CSV, resolves exact Scryfall printings, compiles and validates a candidate, and leaves the active environment untouched:

```bash
docker compose --profile tools run --rm compiler build
docker compose --profile tools run --rm compiler diff --version gch-<candidate-hash>
docker compose --profile tools run --rm compiler diff --version gch-<candidate-hash> --format markdown
docker compose --profile tools run --rm compiler promote --version gch-<candidate-hash>
docker compose up --build -d gulchdale
```

Promotion must name the reviewed candidate version and never commits, rebuilds, or restarts the app. Because the active environment is copied into the production image, activating a promotion requires the `up --build -d` command shown above; a plain restart keeps the previous image. The complete workflow, local Python setup, manifest format, and recovery steps are documented in [`docs/PHASE2_COMPILER.md`](docs/PHASE2_COMPILER.md).

## Running the Phase 3 player flow

Open the server root to host a draft or validate an invitation code. Gulchdale uses canonical `/join/<code>` links, a campfire lobby, profile-driven stage labels, and the existing Draftmancer engine for drafting, reconnects, pools, and exports. Environment freshness and promotion remain operator concerns, never session-owner privileges. The UI and single-active-profile model are documented in [`docs/PHASE3_UI.md`](docs/PHASE3_UI.md).

## Source discussions

- [Gulchdale app outline](https://chatgpt.com/share/6abc5606-f654-83e8-8bb8-c3813aeb4de9) — primary product and architecture plan
- [Link draft to CubeCobra](https://chatgpt.com/share/6abc5460-1a24-83e8-8652-a43ce44e2a0b) — current landing-page and Draftmancer session proof of concept
- [CubeCobra to Draftmancer](https://chatgpt.com/share/6abc5615-a350-83e8-b84c-49d123c9e7a2) — exporter, custom-card, tribal-booster, and maybeboard implementation history
