# Gulchdale

Gulchdale is a standalone, Gulchdale-branded multiplayer Commander Cube drafting application. It is intended to turn the existing CubeCobra-to-Draftmancer workflow into a cohesive product: players visit Gulchdale, host or join a lobby, draft, review their pool, and export a deck without seeing Draftmancer configuration files or manually uploading a cube list.

## Product direction

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

The current design uses four predetermined stages, with two cards selected per pick:

| Stage | Contents |
| --- | --- |
| Pack 1 | 2 Commander, 2 Multicolor, 16 Mono |
| Pack 2 | 2 Commander, 2 Multicolor, 16 Mono |
| Pack 3 | 4 Multicolor, 16 Mono |
| Expedition/Land Pack | 2 Acceleration, 16 Land |

These rules should live in configuration rather than being hard-coded into UI components.

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

## Roadmap

1. **Engine:** Host the current Gulchdale environment on an owned Draftmancer-based server while retaining the upstream UI where practical.
2. **Compiler:** Refactor the existing Python exporter into testable compile, validate, build, and version operations; remove manual CSV/TXT steps.
3. **Gulchdale UI:** Add the branded landing page, host/join flow, campfire lobby, responsive draft interface, and Gulchdale card presentation.
4. **Mechanics:** Give partner acquisition and tribal/custom boosters first-class visual feedback.
5. **Deck builder:** Add commander selection, color-identity guidance, deck/sideboard organization, and exports.
6. **Forge:** Add a private administration surface for CubeCobra sync, validation, environment rebuilds, version history, rollback, and test drafts.
7. **Persistence:** Later, optionally add accounts, draft/deck history, statistics, avatars, achievements, and analytics.

## Engineering principles

- Preserve current Gulchdale behavior and add regression coverage before major refactors.
- Reuse proven Draftmancer functionality instead of rebuilding generic draft infrastructure.
- Keep Gulchdale-specific rules separate from the generic draft engine.
- Keep configuration and compiled cube data separate from presentation code.
- Keep active draft environments immutable.
- Design for responsive desktop/mobile use, Docker deployment, and a Linux-hosted server.
- Do not make authentication a prerequisite for the MVP.

## Current repository state

The repository currently contains an early landing-page prototype and artwork. The page creates a Draftmancer session through Socket.IO, loads a generated `gulchdale.txt` from a GitHub Gist, requests an untimed draft, and asks Draftmancer to report results to CubeCobra. This validates the concept but still depends visibly and operationally on the public Draftmancer service.

The next implementation step should be discovery and architecture work: bring the current exporter, generated environment, custom-card data, and historical settings into the repository as reference fixtures; document every Draftmancer feature they rely on; inspect the upstream engine boundaries; then define the initial application structure before beginning a broad rewrite.

## Source discussions

- [Gulchdale app outline](https://chatgpt.com/share/6abc5606-f654-83e8-8bb8-c3813aeb4de9) — primary product and architecture plan
- [Link draft to CubeCobra](https://chatgpt.com/share/6abc5460-1a24-83e8-8652-a43ce44e2a0b) — current landing-page and Draftmancer session proof of concept
- [CubeCobra to Draftmancer](https://chatgpt.com/share/6abc5615-a350-83e8-b84c-49d123c9e7a2) — exporter, custom-card, tribal-booster, and maybeboard implementation history
