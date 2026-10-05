# Phase 0 legacy architecture inventory

Baseline: e766438 / gulchdale-legacy-v1.0.0. Ticket: GD-000-002.
This inventory describes the working legacy runtime, not the future engine boundary.

## Reproduction identities

| Identity | Value |
| --- | --- |
| Cube Cobra | f1c8be0f-7ac3-420f-81eb-ec8933ce45fa |
| Draftmancer engine | 11f056cc1be6f99795f89d8dc7111d98f1a83c6a |
| Environment | gch-bfc40f9519b9 |
| Environment SHA-256 | bfc40f9519b9da93733b83d2d89ec82b5103b2913c670d955e9b4f95d7040b68 |
| CSV SHA-256 | d5d18e520ec31715a4c59fdadf296ed930d738966673264aa9f9b117ca6fe0c9 |
| Scryfall SHA-256 | c3b149935af1ac1cc3a189781f17a695975a95b9dade62c72f2e98dac8b39a05 |
| Combined YAML + NUL + static YAML SHA-256 | 642c82fc432f4979a7e54271ed5ff441bdff761ed106ede65f33011e4a9a7ff0 |

Manifest: data/cubes/gulchdale.manifest.json. Source1114 rows; sheets commander144,
mono657, land160; custom66, effect52; two warnings (unreferenced spawned cards).
Four stages: 4 commander +16 mono; 2 commander +18 mono; 20 mono; 20 land.
Two cards per pick, eight seats including bots. No new singleton guarantees are implied.

## Entrypoints and data flow

Cube Cobra CSV → committed data/compiler/source/gulchdale.csv + scryfall.json →
compiler/gulchdale_compiler/cli.py/core.py + compiler/config/*.yml →
validated candidate under ignored .gulchdale/ → explicit promotion →
committed data/cubes/gulchdale.txt + manifest → src/Gulchdale.ts parser/cache →
isolated Session custom list → DraftState, passing and pools → Vue deck/export UI.

Normal runtime uses the image's committed artifact; compiler promotion needs a rebuilt
image to activate. Freshness checks can report Cube Cobra changes but are not draft inputs.

Server: src/server.ts, Express5/HTTP, Socket.IO4. package.json starts dist/src/server.js.
Build: tsc to dist/ (ES modules); webpack Vue3 client/src to client/dist.
Production: Dockerfile Node22-Alpine build/runner, nginx8080 → Node3000;
compose publishes configurable host43721. PWA/service worker belongs to client build.
Development: npm run dev; separate server/client watch tasks; Node22 required.
Compiler: Python>=3.12, pinned requirements.lock and pyproject/uv.lock; tools Compose profile.

## Interfaces and session lifecycle

The [generated interface catalog](../reference/legacy-interfaces.json) lists every
literal HTTP/static route and socket registration with its baseline source line.
Regenerate deliberately with `node scripts/inventory-interfaces.mjs --write`;
running it without --write verifies the frozen catalog.

HTTP Gulchdale: /healthz; /join/:code; /api/gulchdale/config;
compiler/status; session create and invitation lookup under /api/gulchdale/sessions.
Other inherited APIs and static/bracket/draftqueue routes remain in server.ts.
Socket contracts: src/SocketType.ts, registration/authorization in server.ts.
Campfire: setUserName, readyCheck/setReady, setSessionOwner, removePlayer, leaveSession.
Draft: startDraft, pickCard/passBooster, draftState/rejoinDraft/endDraft,
pause/resume; deck: moveCard, basic lands, deck/sideboard swaps and logs.
No Phase 0/1 route/socket changes; private administrative tools are offline CLIs.

Sessions and Connections are in-memory maps. Locked Gulchdale sessions pin a cloned
environment/profile; clients cannot replace pack rules or upload another cube.
Disconnects reserve locked lobby seats; reconnect restores identity and seat.
During drafts replacement bots can pick; reconnect restores live packs and pools.
Explicit leave/remove clears seats; start must reject stale/disconnected humans before
constructing DraftState (the discovered crash dereferenced missing Connections[userID]).
Owner-only moderation is checked by socket dispatch, names by server validation.
Random bot IDs/timing are not logical card identity.

Session.ts owns generation, passing, pick effects, bot chains, timers and draft logs.
DraftState.ts stores queues and virtual players. CustomCardList parsers handle AddCards
partner/tribal rewards and other inherited effects. Existing effects can yield duplicates
across players; this is not an engine bug under the adopted virtual-supply direction.
The new orchestrator/simulator will decide per-player permissions, not a global allocator.
Client deck-builder and export behavior remain inherited; custom object export caveats
remain visible rather than silently converted into new rules.

## Persistence and artifacts

src/Persistence.ts serializes plain session/connection objects to file-based tmp state
under PERSISTENCE_LOCAL_PATH. Compose gulchdale-state is distinct from the new DB.
Inactive session restore and reconnect remain the legacy mechanisms. No schema rewrite.

Tracked: src/client sources, package lock, data card databases, committed cube/compiler
inputs, branding, docs, compiler tests and archived prototype.
Generated/ignored: dist, client/dist, node_modules, Python venv/cache, tmp runtime state,
.gulchdale candidates, ecosystem/.runtime (credentials/service data; never image/commit).
Externally sourced: Draftmancer snapshot, Cube Cobra export, Scryfall cache/images,
npm/Python dependencies. Image URLs are metadata; offline gameplay needs bundled card data,
not an online import API. Remote image availability is not an offline asset guarantee.
Reference prototype/cloudflared testing is retired; not production hosting architecture.

## Keep / Wrap / Replace Later / Retire

| Subsystem | Assessment | Boundary |
| --- | --- | --- |
| Card rendering, hover and deck builder/export | Keep | Proven Vue UI; defer product polish |
| Socket transport, authorization and reconnect | Keep | Existing contracts and regression coverage |
| Passing queues, timers and bot picks | Keep | No collation rewrite in preservation phases |
| Session/DraftState entry and custom effects | Wrap | Future narrow adapter; preserve legacy effects |
| Custom-list parsing and compiler artifact | Keep/Wrap | Python reproduction and compatibility facade |
| Pool ownership, supply, weights and releases | Replace Later | New Gulchdale domain, simulator before cutover |
| Draft sequencing and reward orchestration | Replace Later | Independent state machine before adapter |
| File session persistence | Keep | Legacy until orchestrated acceptance |
| External cube importer at runtime | Wrap | Snapshot workflow only for new content |
| Generic upstream formats/collection/collation | Keep | Dormant in locked mode; no cleanup rewrite |
| External analytics/bot services | Wrap | Audit inherited opt-ins; no new live dependency |
| Public Draftmancer launcher/cloudflared prototype | Retire | Archive only; no temporary hosting support |
| Global singleton allocator research | Retire | Superseded by final-deck singleton/virtual supply |

## Quality, attribution and deployment assumptions

Tests: Gulchdale unit/freshness/lobby/controls, production-engine acceptance,
compiler pytest reproduction/validation, inherited Mocha effects/manual/frontend suites.
CI: server+production audit+acceptance; client types/build; compiler validation; image
release/build; inherited compatibility is manual dispatch, not a blocker requiring
all unrelated upstream tests to be repaired. Production audit findings are triaged
by impact/reachability, not by wholesale library adoption.

LICENSE retains Draftmancer's MIT attribution; UPSTREAM.md records pinned revision.
Magic/card artwork and external data are not relicensed by MIT. Legal/commercial
distribution and upstream data terms remain Phase 10 work, not presumed permission.
LAN/self-hosted deployment assumes a persistent volume, reverse-proxy socket upgrades,
a rebuilt image for promoted content and no public admin secrets. Future TLS, backups,
privacy and operator configuration need deployment gates before public hosting.

See [baseline runbook](../LEGACY_BASELINE.md), [boundary ADRs](../decisions/ADR-0003-domain-and-engine-boundary.md)
and the generated patch manifest for exact upstream differences.
