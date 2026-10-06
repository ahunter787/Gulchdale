# Gulchdale work explained

This is the human-readable companion to the roadmap. Its descriptions are published
inside the existing Plane modules and tickets, and this full catalog is published in
Outline. The roadmap owns status and membership; this catalog explains the work.
Adopted decisions override older recommendations in the Charter or Systems Map.
Recommendations are proposals, not permission to implement unanswered game rules.

## GD-000 — Architecture and legacy baseline

### Purpose
Protect the Gulchdale that already works so the overhaul never loses the playgroup's accumulated behavior.
### Expected outcome
A recoverable legacy application, reproducible tests, an architecture inventory, and clear ownership boundaries for the new systems.
### Current state
Phase 0 is complete. The original baseline and tested preservation checkpoint are local Git recovery points. Legacy is still the default application.
### Open questions
None block preservation. Future engine changes must explain their compatibility impact rather than silently replacing legacy behavior.
### Completion criteria
A fresh clone can reproduce the legacy draft, and an engineer can identify what stays, what gets wrapped, and what may be replaced later.
### Related reading
[Legacy recovery and reproduction](LEGACY_BASELINE.md), [architecture inventory](architecture/LEGACY_INVENTORY.md), and [verified exit record](OVERHAUL_PHASE_0_1_VERIFICATION.md).
### Engineering notes
Do not import upstream Git history, rewrite the engine, or remove the existing file persistence. Public routes and sockets remain stable.

## GD-100 — Data foundation and releases

### Purpose
Give Gulchdale its own trustworthy record of cards, rules, metadata, and releases instead of making another application's library the source of truth.
### Expected outcome
An application-owned database with reviewed imports, immutable releases, and a recoverable live-release pointer.
### Current state
Phase 1 is complete. The committed pool is imported and promoted locally; the new foundation does not serve legacy drafts or change their content.
### Open questions
No foundation gate remains open. Future curation must decide which changes require a second human review before publishing.
### Completion criteria
The current pool can be inspected independently of Cube Cobra and Draftmancer, and refreshes cannot erase human overrides or historical releases.
### Related reading
[Foundation operator guide](FOUNDATION.md) and [source/release boundaries](decisions/ADR-0004-source-and-release-pipeline.md).
### Engineering notes
Use the separate Gulchdale database, never Plane or Outline storage. Browser editing belongs to Phase 6.

## GD-200 — Card graph and external data

### Purpose
Describe what cards mean to Gulchdale while retaining the evidence behind imported information and human judgment.
### Expected outcome
Snapshot-based external imports, sparse affinities, categorical tags, archetypes, and difficulty information that can be reviewed and released.
### Current state
Offline snapshot import is complete. Storage exists for the future graph; unknown affinities are neutral and unknown difficulty is not fabricated. The full cube has not been tagged.
### Open questions
The launch archetype and location vocabulary still needs curation. Whether a separate power metric is required for the first slice remains a later design choice.
### Completion criteria
Metadata is understandable, attributable, and reproducible; source refreshes preserve human intent and drafts need no live external data service.
### Related reading
[Systems Map](architecture/SYSTEMS_MAP_v1.0.md), [foundation guide](FOUNDATION.md), and [source pipeline ADR](decisions/ADR-0004-source-and-release-pipeline.md).
### Engineering notes
Start the simulator with a small curated slice, not cube-wide tagging. Preserve exact source snapshots separately from derived values.

## GD-300 — Pack generation and simulation

### Purpose
Make packs respond to a player's journey without becoming inexplicable, unfair, or dependent on scarce physical copies during simulation.
### Expected outcome
Reproducible immediate-resolution shared and private packs, with explainable weights, supply accounting, and small-slice simulations.
### Current state
Phase 2 is Building. The owner-approved supply accounting prototype is implemented; seeded scoring and the curated pack simulator are not yet implemented. Legacy is unchanged.
### Open questions
Supply decisions are resolved in ADR-0009: exactly four/eight seats, generation-time holds, immediate resolution and equivalent replacement rewards. Real small-slice content and randomness/crowding calibration require review and playtest evidence.
### Completion criteria
An administrator can replay generation and explain each candidate's score and supply use without opening a browser.
### Related reading
[Open owner decisions](decisions/ADR-0007-open-game-rules.md) and [pack/supply design](architecture/SYSTEMS_MAP_v1.0.md).
### Engineering notes
No new pack passes. Release unselected holds unless an explicit session-burn policy applies. GD-300-002 is the next headless proof; no full-cube tagging or engine rewrite.

## GD-400 — Draft orchestration and Expeditions

### Purpose
Turn drafting into one coherent adventure with meaningful questions, locations, and rewards between shared drafting stages.
### Expected outcome
A data-driven phase state machine, Expedition definitions, player barriers, and recovery tools independent of Draftmancer.
### Current state
Phase 3 and advanced Phase 9 work have not started. The first Expedition and Adornment details await GD-400-901.
### Open questions
First-script content, pacing, shared versus private questions, reward counts, and color-expansion limits remain open. Later Warbands and Signature Spells need real play data first.
### Completion criteria
A simulated Expedition completes without Draftmancer; future content extends configuration rather than forking the flow.
### Related reading
[Expedition owner gate](decisions/ADR-0007-open-game-rules.md) and [domain/engine boundary](decisions/ADR-0003-domain-and-engine-boundary.md).
### Engineering notes
Shared stages wait for all players. Disconnected private choices pause for recovery rather than auto-resolving; these rules are already adopted.

## GD-500 — Draftmancer adapter and playable integration

### Purpose
Evaluate proven backend and card-rendering ingredients while Gulchdale owns the new game, scenes, ownership and workflow. Legacy screens are not design references.
### Expected outcome
A thin adapter and a four-player playable slice that demonstrates a better experience than the legacy draft.
### Current state
Phases 4 and 5 have not started. The legacy engine is pinned and audited; no overhaul adapter or new browser flow exists yet.
### Open questions
Reviewed card primitives may be adapted; exact dependency isolation, phase gating, pool projection and recovery need the GD-500-001 proof. GD-500-901 must settle commander/deck counting and Adornment representation before legality enforcement.
### Completion criteria
Players pause and resume without lost state, complete the intended deck, and leave a complete audit trail.
### Related reading
[Engine boundary](decisions/ADR-0003-domain-and-engine-boundary.md), [compatibility gate](decisions/ADR-0005-compatibility-and-rollout.md), and [legality questions](decisions/ADR-0007-open-game-rules.md).
### Engineering notes
Follow ADR-0009 and the continuation technical proof. Do not mount the legacy App controller or use traditional passing to drive the new game. No deep fork changes before simulator/orchestrator gates; legacy remains available for rollback.

## GD-600 — Curation, administration, and publishing

### Purpose
Let a curator improve Gulchdale safely without directly editing a live draft or losing the reason for a change.
### Expected outcome
Staging edits, understandable release diffs, reviewed publishing, protected rollback, and linked decision records.
### Current state
Read-only operator inspection is complete. Browser curation and release-management UI are Phase 6 and have not started.
### Open questions
Which changes require another reviewer, and when Gulchdale becomes the primary card-list editing interface, remain future workflow decisions.
### Completion criteria
Routine curation can be staged and published without source edits, while previous immutable releases remain recoverable.
### Related reading
[Foundation workflow](FOUNDATION.md) and [release pipeline ADR](decisions/ADR-0004-source-and-release-pipeline.md).
### Engineering notes
Never mutate LIVE content directly. Publishing moves a pointer to an immutable release; rollback must not rewrite historical draft facts.

## GD-700 — Telemetry and analytics

### Purpose
Help humans judge cube health using what players actually saw, passed, picked, built, and experienced.
### Expected outcome
Append-only events, rebuildable reports, confidence-aware health views, and qualitative playtest feedback.
### Current state
Phase 7 has not started. Legacy logs are not being presented as the complete future event store.
### Open questions
Health thresholds, fun versus win-rate weighting, and evidence carried across major releases need data and owner review. Public retention is also part of GD-800-901.
### Completion criteria
Curation reports retain release context, show sample sizes, and support judgment rather than automatically changing the pool.
### Related reading
[Telemetry and health systems](architecture/SYSTEMS_MAP_v1.0.md) and [privacy owner gate](decisions/ADR-0007-open-game-rules.md).
### Engineering notes
Record facts immutably; rebuild analytics projections. No automatic live rebalancing or retroactive reinterpretation using today's metadata.

## GD-800 — Player personalization

### Purpose
Recognize returning players without making accounts mandatory, exposing private information, or trapping players in their past preferences.
### Expected outcome
Recoverable anonymous identity, ability signals, and evidence-backed preferences with bounded influence.
### Current state
Phase 8 has not started. Persistent identity, consent, retention, and personalization limits require GD-800-901.
### Open questions
Recovery, deletion/export, retention, inspectable preferences, evidence thresholds, and influence caps remain open.
### Completion criteria
Players understand their choices and controls; the current Expedition outweighs historical favorites and no mid-draft ability change occurs.
### Related reading
[Player-learning design](architecture/SYSTEMS_MAP_v1.0.md) and [identity/privacy decisions](decisions/ADR-0007-open-game-rules.md).
### Engineering notes
The roughly 15% pet-card influence target is experimental, not an approved constant. Mailpit is development mail only if accounts are later introduced.

## GD-900 — Deployment and buildability

### Purpose
Make a specific Gulchdale release reproducible for another operator and eventually affordable to assemble physically.
### Expected outcome
Cost snapshots, substitutions, shopping manifests, hardened deployment, backups, privacy controls, and external-operator documentation.
### Current state
Phase 10 has not started. The temporary cloudflared test site is retired; proper hosting and store workflows are not prerequisites for the current simulator.
### Open questions
Hosting target, physical-copy reconciliation, safe operator settings, device assumptions, external-source terms, and any commercial strategy need later decisions.
### Completion criteria
Another operator can reproduce, back up, recover, and physically reconcile an immutable release without its creator present.
### Related reading
[Buildability/deployment design](architecture/SYSTEMS_MAP_v1.0.md) and [legacy deployment assumptions](architecture/LEGACY_INVENTORY.md).
### Engineering notes
Local Git tags are recovery references, not off-machine backups. No public deployment or legal permission is implied by the current foundation.

## phase-00 — Preserve, audit, and establish guardrails

### Purpose
Keep the proven draft playable while learning exactly where the new architecture can be introduced safely.
### Expected outcome
A frozen baseline, reproduction instructions, golden draft test, upstream patch inventory, and accepted boundaries.
### Current state
Complete. A fresh clone reproduced the legacy draft, and preservation tickets GD-000-001 through GD-000-007 passed their gates.
### Open questions
None remain for this exit gate. Known inherited limitations are documented rather than hidden or expanded into rewrites.
### Completion criteria
A new developer can clone, build, test, and reproduce all four legacy rounds without secret manual steps.
### Related reading
[Verified exit record](OVERHAUL_PHASE_0_1_VERIFICATION.md), [inventory](architecture/LEGACY_INVENTORY.md), and [legacy runbook](LEGACY_BASELINE.md).
### Engineering notes
The narrow unavailable-player preflight is the only engine correction. No public interface or persistence rewrite occurred.

## phase-01 — PostgreSQL data foundation

### Purpose
Make Gulchdale capable of representing its current pool independently without switching the working application to an unproven runtime.
### Expected outcome
Separate database storage, exact offline snapshots, reviewed staging, immutable releases, and read-only inspection.
### Current state
Complete. The initial release is promoted locally and reconciles with the legacy pool, rules, engine, sources, and counts.
### Open questions
None block this exit. Supply scaling and browser curation are intentionally later work, not missing foundation behavior.
### Completion criteria
The pool is reproducible offline, refresh preserves human overrides, and a shadow database outage cannot prevent legacy drafting.
### Related reading
[Foundation guide](FOUNDATION.md) and [verified exit record](OVERHAUL_PHASE_0_1_VERIFICATION.md).
### Engineering notes
Legacy remains default; orchestrated mode is refused. Initial inspection is through operator CLIs, not a browser editor.

## phase-02 — Seeded pack simulator

### Purpose
Prove that guided packs and virtual supply can produce understandable, replayable choices before touching multiplayer integration.
### Expected outcome
Small-slice immediate-pack simulations with generation-time holds, scoring explanations, replacement rewards and scarcity reporting.
### Current state
Building. GD-300-001 delivers the approved supply subset, with synthetic accounting tests. It does not deliver a seeded generator or claim the real cube is balanced.
### Open questions
No supply question remains for the bounded simulator after ADR-0009. The real curated slice and archetype capacities need content review; randomness calibration remains a test hypothesis. Synthetic engineering fixtures do not clear the real balance gate.
### Completion criteria
Thousands of simulated packs can be replayed from release, seed, and state, and each score and reservation can be explained.
### Related reading
[Supply owner decisions](decisions/ADR-0007-open-game-rules.md) and [simulator design](architecture/SYSTEMS_MAP_v1.0.md).
### Engineering notes
Start near 20 commanders, 100 cards, and 5-8 archetypes. Do not tag the full cube or patch Draftmancer to bypass the gate.

## phase-03 — Independent orchestrator and Expedition flow

### Purpose
Let an adventure progress through questions, narrative, private rewards, and shared draft stages without depending on the old engine's round sequence.
### Expected outcome
A data-driven state machine, leader marking, one location choice, one Adornment flow, and recovery actions.
### Current state
Not started. Depends on validated simulation and the approved first-Expedition decisions in GD-400-901.
### Open questions
First-script choices, reward counts, pacing, and Adornment eligibility/limits remain open. Barrier and disconnected-private-choice behavior are already settled.
### Completion criteria
A simulated Expedition completes independently of Draftmancer, with recoverable phase state and clear player consequences.
### Related reading
[Expedition decision record](decisions/ADR-0007-open-game-rules.md) and [orchestrator boundary](decisions/ADR-0003-domain-and-engine-boundary.md).
### Engineering notes
Shared play resumes only after every player reaches the barrier. Never silently auto-answer a disconnected player's private choice.

## phase-04 — Thin Draftmancer adapter

### Purpose
Connect validated Gulchdale contracts to selected backend capabilities and adapted low-level card primitives inside an entirely new scene UI.
### Expected outcome
Authoritative phase gates, immediate-offer presentation, idempotent reward/pool projection, recovery, and event bridging. Demonstrate floating cards and hidden pool presentation without adopting legacy screens.
### Current state
Not started. The simulator and independent orchestrator must prove the boundaries first.
### Open questions
The exact patch surface and safe card-component reuse need technical discovery at this phase, not speculative redesign now.
### Completion criteria
A real four-player session pauses for questions/private choices and resumes without lost packs, pools, identities, or reconnect state.
### Related reading
[Adapter boundary](decisions/ADR-0003-domain-and-engine-boundary.md), [upstream audit](../UPSTREAM.md), and [rollout gate](decisions/ADR-0005-compatibility-and-rollout.md).
### Engineering notes
Legacy stays default through this phase. No new pack passes. Timer pause alone is not a barrier; client addCards alone is not a grant. GD-500-001 specifies the real-client proof.

## phase-05 — Four-player playable vertical slice

### Purpose
Show the playgroup a complete new experience before declaring it a replacement for legacy Gulchdale.
### Expected outcome
Four retained commanders, one marked leader, two meaningful questions, one private Choice Pack, a legal 60-card deck, and a complete audit trail.
### Current state
Not started. Depends on the adapter and approved legality details in GD-500-901.
### Open questions
Commander placement/counting, command-zone roles, and Adornment representation need approval. Playtests must establish whether the new flow is actually preferable.
### Completion criteria
Four people finish the entire flow, recover from interruptions, build their decks, and can explain their rewards and permissions.
### Related reading
[Deck-rule decisions](decisions/ADR-0007-open-game-rules.md) and [cutover/rollback conditions](decisions/ADR-0005-compatibility-and-rollout.md).
### Engineering notes
No cutover based only on passing unit tests. Retain legacy rollback until this acceptance gate is demonstrated.

## phase-06 — Curation, releases, and rollback

### Purpose
Make safe day-to-day curation accessible to a human rather than requiring source-file edits and manual release bookkeeping.
### Expected outcome
Browser staging edits, release diffs, reviewed publishing, protected rollback, and a gradual Cube Cobra transition.
### Current state
Not started. Foundation inspection exists, but no browser editing or curation workflow is claimed.
### Open questions
Review permissions and the transition timing for primary card-list editing need approval before the workflow is exposed.
### Completion criteria
A curator can review, publish, and restore a release while ongoing drafts retain their original identities and historical records.
### Related reading
[Existing release workflow](FOUNDATION.md) and [staging/release ADR](decisions/ADR-0004-source-and-release-pipeline.md).
### Engineering notes
All edits are staged. Link impactful changes to Plane/Outline records; never edit immutable live content in place.

## phase-07 — Telemetry and cube health

### Purpose
Replace guesswork in curation meetings with version-aware evidence while retaining human judgments about fun and political quality.
### Expected outcome
Seen/pass/pick/deck/game history, health dashboards, confidence warnings, and linked playtest reports.
### Current state
Not started. Depends on complete event emission and real vertical-slice playtests.
### Open questions
Unhealthy-card thresholds and the balance of win rate versus fun require sufficient data. Public retention needs the privacy decision record.
### Completion criteria
Reports show denominators and release context, can be rebuilt from immutable facts, and do not automatically rebalance the cube.
### Related reading
[Telemetry/analytics design](architecture/SYSTEMS_MAP_v1.0.md) and [privacy decisions](decisions/ADR-0007-open-game-rules.md).
### Engineering notes
Analytics are projections, not historical truth. Keep qualitative notes rather than attempting sentence-level AI analysis in the first version.

## phase-08 — Persistent player learning

### Purpose
Let returning players feel recognizable without requiring accounts or letting past preferences dictate the current adventure.
### Expected outcome
Anonymous continuity, recoverable identity, ability signals, and confidence-backed preferences with bounded pet-card influence.
### Current state
Not started. GD-800-901 is the privacy and personalization gate.
### Open questions
Retention, consent, recovery, inspectability, evidence thresholds, and caps remain undecided. Authenticated accounts are optional later scope.
### Completion criteria
Players have understandable controls, current choices dominate learning, and privacy/recovery behavior is documented and tested.
### Related reading
[Identity and personalization decisions](decisions/ADR-0007-open-game-rules.md) and [player-profile design](architecture/SYSTEMS_MAP_v1.0.md).
### Engineering notes
No mid-draft ability changes. Experimental influence percentages are not production rules.

## phase-09 — Advanced systems after real play data

### Purpose
Expand the adventure only after the basic experience works and actual playtests justify extra complexity.
### Expected outcome
More locations, Warbands, Signature Spells, tribe packages, modes, and better crowding/difficulty behavior.
### Current state
Not started. Requires a successful slice and meaningful telemetry; none of these systems is being added speculatively now.
### Open questions
Which additions improve play, their exact rules, and whether stronger crowding mechanics are warranted require later owner decisions.
### Completion criteria
New modes are data/configuration extensions of the shared engine and graph, with evidence that the added complexity helps players.
### Related reading
[Advanced systems and design goals](architecture/SYSTEMS_MAP_v1.0.md) and [Design Charter](architecture/DESIGN_CHARTER.md).
### Engineering notes
Do not replace the initial crowding behavior with punitive card destruction without an explicit new decision.

## phase-10 — Buildability, deployment, and privacy

### Purpose
Let someone outside the original playgroup operate and physically assemble a known Gulchdale release safely.
### Expected outcome
Cost snapshots, Community Build substitutions, shopping manifests, deployment hardening, backups, privacy controls, and operator documentation.
### Current state
Not started. The temporary test website is retired; public hosting and store workflows remain future work.
### Open questions
Hosting target, device assumptions, physical-copy shortages, safe operator configuration, source rights, and any commercial strategy need later review.
### Completion criteria
Another operator can reproduce the release, reconcile physical copies, recover data, and understand the operational and privacy requirements.
### Related reading
[Deployment/buildability design](architecture/SYSTEMS_MAP_v1.0.md) and [recorded deployment limitations](architecture/LEGACY_INVENTORY.md).
### Engineering notes
The rough community cost targets are aspirations, not verified prices. Commercial/licensing work is separate from technical deployment.

## GD-000-001 — Publish governing documents and legacy labels

### Purpose
Prevent the overhaul from being guided by scattered conversations or obsolete phase numbers.
### Expected outcome
Published Charter, Systems Map, roadmap, legacy/as-built labels, and superseded old Phase 4 research.
### Current state
Complete. The governing documents were published before product changes, and the repository remains authoritative.
### Open questions
None remain for this ticket. New decisions must be recorded and linked, not silently inferred from historical recommendations.
### Completion criteria
People can find the design and distinguish overhaul phases from the earlier legacy implementation phases.
### Related reading
[Roadmap](roadmap.md), [governance ADR](decisions/ADR-0006-document-governance.md), and [exit evidence](OVERHAUL_PHASE_0_1_VERIFICATION.md).
### Engineering notes
Plane/Outline are synchronized mirrors. This catalog supplies readable descriptions without changing the existing ticket identities.

## GD-000-002 — Inventory architecture and data flow

### Purpose
Understand the working application before deciding what the overhaul should keep or replace.
### Expected outcome
A server/client/compiler/persistence inventory, interface catalog, provenance, deployment assumptions, and subsystem assessment.
### Current state
Complete. The inventory documents the committed Cube Cobra-to-compiler-to-legacy-engine path and Keep/Wrap/Replace Later/Retire decisions.
### Open questions
None block the inventory exit. Exact future adapter patches belong to Phase 4 discovery.
### Completion criteria
An engineer can trace data into a draft and find the relevant lifecycle, tests, artifacts, and inherited limitations.
### Related reading
[Architecture inventory](architecture/LEGACY_INVENTORY.md) and [accepted domain boundary](decisions/ADR-0003-domain-and-engine-boundary.md).
### Engineering notes
The frozen catalog records 26 literal HTTP/static registrations and 106 socket event names; it is an audit, not a new public API.

## GD-000-003 — Freeze and reproduce the legacy baseline

### Purpose
Give the overhaul a known, recoverable starting point rather than relying on one machine's installed state.
### Expected outcome
Frozen input hashes, local recovery tags, bootstrap instructions, and fresh-clone reproduction.
### Current state
Complete. Original inputs are unchanged; a clean clone reproduced the legacy draft and the tested checkpoint preserves the narrow reliability correction.
### Open questions
None remain for local preservation. Tags are not an off-machine backup; a remote push would require separate authorization.
### Completion criteria
The documented workflow reproduces the committed environment and distinguishes the original baseline from the tested preserved version.
### Related reading
[Legacy recovery runbook](LEGACY_BASELINE.md) and [fresh-clone evidence](OVERHAUL_PHASE_0_1_VERIFICATION.md).
### Engineering notes
Original tag: `gulchdale-legacy-v1.0.0`. Tested checkpoint: `gulchdale-legacy-preserved-v1.0.1`. Do not move either tag or reset a live checkout to recover.

## GD-000-004 — Golden smoke and stale-player regression

### Purpose
Catch loss of real drafting behavior and prevent the observed start crash from returning.
### Expected outcome
A reproducible four-round draft covering controls, effects, pool integrity, restoration, export, and existing reconnect/bot acceptance.
### Current state
Complete. The missing-Connection crash was reproduced and narrowly fixed; repeated seeded runs match the committed pack and pool fingerprints.
### Open questions
None remain for this legacy gate. The shutdown serializer's shallow-copy limitation remains documented; it is not a safe live checkpoint API.
### Completion criteria
Tests reject stale players before mutation and complete the actual legacy flow without weakening the locked rules or custom rewards.
### Related reading
[Golden acceptance explanation](LEGACY_BASELINE.md) and [test evidence](OVERHAUL_PHASE_0_1_VERIFICATION.md).
### Engineering notes
Run `npm run test-gulchdale` and `npm run test-gulchdale-acceptance`. Never silently regenerate the reviewed golden fixture.

## GD-000-005 — Verify Draftmancer pin and patch manifest

### Purpose
Know exactly what Gulchdale inherited without maintaining an imported upstream Git history or chasing every library change.
### Expected outcome
An isolated archive comparison at the pinned revision and a documented baseline patch manifest.
### Current state
Complete. The audit found 1,856 upstream files, 1,821 identical baseline files, and 123 documented differences; no upstream ancestry was merged.
### Open questions
None remain for this pin audit. Future upstream adoption frequency is a later maintenance decision, not permission to merge now.
### Completion criteria
The archive hash and changed/added/removed paths can be verified, and post-baseline compatibility changes are explained.
### Related reading
[Upstream attribution and patch notes](../UPSTREAM.md) and [audit workflow](LEGACY_BASELINE.md).
### Engineering notes
Run `npm run verify:upstream`; it uses a temporary pinned source archive. Do not import Git history, use audit-fix force, or repair unrelated formats to silence warnings.

## GD-000-006 — Adopt architecture-boundary ADRs

### Purpose
Keep the overhaul modular and prevent the new foundation from becoming a hidden rewrite of Draftmancer.
### Expected outcome
Accepted database, domain/engine, source/release, rollout, and documentation-governance decisions.
### Current state
Complete. Gulchdale owns data and orchestration; the legacy engine retains proven rendering, transport, passing, reconnects, and deck UI.
### Open questions
None block these boundaries. Game rules with unanswered owner choices remain pending in their own decision tickets.
### Completion criteria
An implementer can identify system ownership and the compatibility gate before adding new behavior.
### Related reading
[Database/runtime ADR](decisions/ADR-0002-runtime-and-database.md), [domain boundary](decisions/ADR-0003-domain-and-engine-boundary.md), and [rollout ADR](decisions/ADR-0005-compatibility-and-rollout.md).
### Engineering notes
Keep `src/Gulchdale.ts` as compatibility facade until the adapter phase. No Phase 0 public route/socket changes.

## GD-000-007 — Phase 0 review and exit gate

### Purpose
Require demonstrated preservation before new systems are built on top of assumptions.
### Expected outcome
A reviewed fresh-clone baseline and green application/compiler/client/image/ecosystem verification.
### Current state
Complete. The documented Phase 0 gate passed and its evidence is committed and published.
### Open questions
None remain for the exit. This does not approve future game rules or authorize a runtime cutover.
### Completion criteria
The preservation evidence is reproducible and published copies agree with the repository.
### Related reading
[Exit record](OVERHAUL_PHASE_0_1_VERIFICATION.md), [legacy runbook](LEGACY_BASELINE.md), and [roadmap](roadmap.md).
### Engineering notes
Composite command: `npm run verify:legacy`; mirror gate: `make -C ecosystem verify`. Use the documented Python environment for compiler tests.

## GD-100-001 — Application PostgreSQL and migrations

### Purpose
Store Gulchdale's new data independently without risking the ticketing or documentation databases.
### Expected outcome
A separate PostgreSQL service/volume and checked-in application migrations.
### Current state
Complete. The local foundation database has no host database port; disposable integration tests apply migrations twice successfully.
### Open questions
None remain for the local data-foundation ticket. Production backup and operator deployment policies are Phase 10 work.
### Completion criteria
Storage is isolated, schema setup is reproducible, and immutable records cannot be casually overwritten by import operations.
### Related reading
[Foundation database workflow](FOUNDATION.md) and [database isolation ADR](decisions/ADR-0002-runtime-and-database.md).
### Engineering notes
Never reuse Plane/Outline databases. Credentials remain ignored local configuration; migrations are intentionally non-destructive.

## GD-100-002 — Runtime isolation and domain repositories

### Purpose
Introduce the new application domain without making a database outage a new way to break a working legacy draft.
### Expected outcome
Explicit domain/repository boundaries and legacy, shadow, and gated orchestrated runtime modes.
### Current state
Complete. Legacy defaults remain active; shadow comparison fails safely, and premature orchestrated startup is refused.
### Open questions
None block this ticket. Orchestrated eligibility depends on later adapter/vertical-slice acceptance, not a configuration shortcut.
### Completion criteria
The legacy draft works during a shadow database outage and public route/socket contracts remain unchanged.
### Related reading
[Runtime guide](FOUNDATION.md), [runtime ADR](decisions/ADR-0002-runtime-and-database.md), and [boundary ADR](decisions/ADR-0003-domain-and-engine-boundary.md).
### Engineering notes
Use `GULCHDALE_RUNTIME_MODE=legacy|shadow|orchestrated`; orchestrated currently rejects startup. Never let shadow mutate engine state.

## GD-200-001 — Offline snapshot import and validation

### Purpose
Represent the current pool using committed evidence, not live service availability or an opaque Draftmancer parser.
### Expected outcome
Deterministic TypeScript import of committed CSV, Scryfall, YAML, manifest, and legacy artifact snapshots into sealed staging.
### Current state
Complete. Six exact snapshots reconcile with 1,114 source rows and the existing sheet/custom/effect counts. Human overrides are outside imported data.
### Open questions
None remain for the initial import. New external-source schemas must be reviewed rather than silently accepted during future refreshes.
### Completion criteria
Repeated imports produce the same workspace without duplicates, corrupt references are rejected, and no live external data service is needed.
### Related reading
[Import workflow and provenance](FOUNDATION.md) and [snapshot pipeline ADR](decisions/ADR-0004-source-and-release-pipeline.md).
### Engineering notes
Python reproduces the legacy artifact; TypeScript imports new storage. Historical Notes quote tolerance preserves exact bytes without relaxing reference/count validation.

## GD-100-003 — Immutable releases and reviewed promotion

### Purpose
Make a content release explainable and recoverable, with no accidental publishing based on an outdated review.
### Expected outcome
Immutable Pool, Metadata, Rules, Engine and Environment identities, value diffs, reviewed promotion, and a movable foundation pointer.
### Current state
Complete. The initial release was reviewed, promoted, and reconciled. Integration tests preserve old releases/overrides and reject stale review digests.
### Open questions
None block the foundation. Browser approval roles and protected rollback UX are later curation work.
### Completion criteria
Each release contains all required immutable identities and can be inspected without source services; source drift cannot hide behind unchanged counts.
### Related reading
[Release/operator guide](FOUNDATION.md) and [verified release evidence](OVERHAUL_PHASE_0_1_VERIFICATION.md).
### Engineering notes
Promotion changes only the foundation pointer, never the legacy environment. Generate a diff and explicitly review its digest before promotion.

## GD-600-001 — Read-only catalog and comparison views

### Purpose
Let an operator inspect imported data and release provenance before any editing interface is trusted.
### Expected outcome
Read-only catalog, release, stored-workspace validation, and legacy comparison outputs.
### Current state
Complete through operator CLIs. No browser editor, public admin endpoint, or direct live-content mutation was introduced.
### Open questions
None remain for these inspection views. Browser curation design belongs to Phase 6.
### Completion criteria
The operator can inspect exact release identities and see source/pool/rule/engine/count mismatches; intentional metadata overrides are reported separately.
### Related reading
[Inspection commands](FOUNDATION.md) and [foundation exit record](OVERHAUL_PHASE_0_1_VERIFICATION.md).
### Engineering notes
Use `catalog`, `release`, `validate`, and `compare` through the documented foundation operator wrapper. Inspection does not move the live pointer.

## GD-100-004 — Phase 1 exit gate

### Purpose
Require proof that the new data foundation is independently useful while the legacy draft remains fully operational.
### Expected outcome
Reconciled initial immutable release, repeatable database tests, fresh-clone verification, and synchronized documentation/tickets.
### Current state
Complete. Both fresh-clone verification commands passed; the promoted foundation agrees with the legacy evidence and a shadow outage does not block drafting.
### Open questions
None remain for Phase 1. GD-300-901 is a separate Phase 2 owner gate, not an incomplete database task.
### Completion criteria
The current pool is represented independently, all preservation gates stay green, and no runtime cutover has occurred.
### Related reading
[Verified exit record](OVERHAUL_PHASE_0_1_VERIFICATION.md), [foundation guide](FOUNDATION.md), and [roadmap](roadmap.md).
### Engineering notes
Run `npm run verify:foundation` and the documented legacy/ecosystem gates. Do not begin full-cube tagging as an exit shortcut.

## GD-300-901 — Decide virtual supply and reservation behavior

### Purpose
Decide how Gulchdale offers useful choices while keeping category supply, player singleton and physical budget concerns understandable. Physical inventory is a later reconciliation concern; virtual supply governs the simulator.
### Expected outcome
An owner-approved four/eight-seat policy with explicit pack, shortage and content/research boundaries.
### Current state
Complete as an owner decision, not as an implemented simulator. ADR-0008 preserves the first answers; ADR-0009 records later answers and direct conversation confirmations. Phase 2 remains Building; the existing prototype does not yet hold options at generation or generate replacement rewards.
**Adopted:** tribal injections share two copies per card at four players and three at eight. Commanders, support packages, Main Deck cards and utility lands are draft-unique. Commander staples are personal grants, never draftable options. Fixing lands and Gulchdale assets use personal supply.
**Adopted:** no player may hold duplicates in their draft pool. Private rewards consume only the selected card in the one-selection case; the general pack definition supplies retained count. Unselected options return to available supply unless explicitly session-burned. Tribal injections consume shared scaled supply.
**Future direction, not a legacy change:** budget fixing and expanded personal staples require content review; the legacy land round and imported quantities remain unchanged.
### Open questions
**Answers received — no remaining questions for this simulator gate.**

- **Q1:** Exactly four or eight seats including bots; five humans require three bots. No intermediate-count scaling formula is needed.
- **Q2:** Show tribal allocation/scarcity; allow smaller tribal offers if they meet retained count, otherwise offer a same-size legal reward from weighted archetypes. Charge a Tribal Booster only on successful selection; preserve it if no equivalent replacement is possible.
- **Q3:** All new packs resolve immediately. Selected cards consume supply; release unselected holds unless an explicit session-burn policy removes them. Deliberate decline burns one player-chosen held copy and closes the opportunity without rerolling, releasing other holds and preserving the booster. Disconnect preserves the offer; technical failure never burns. Legacy passing remains untouched.
- **Q4:** Screen and hold options atomically at generation so competing open offers cannot share draft-unique cards or exceed scaled tribal limits. Holds are temporary, not permanent consumption. Shared stages rotate first priority from a seeded initial order, including bot seats.
- **Q5:** Defer fixing/assets and expanded staples to content review. Review high-budget, three-color, game-changer and salty cards; strengthen tribal support. Arcane Signet, Evolving Wilds and Command Tower were cited as staples-list examples, not a completed approved list.
- **Q6:** Main Deck for now. The Gulch and The Caravan remain possible future names.

Defector mechanics are research-only advanced-system scope. The commander and tribe following a defection is the intended concept; subtype, mana-payment and tabletop rules are not approved. The 36-spell/24-land and 8-12 Expedition estimates are calibration intent, not fixed counts. Real content review and separate Expedition/deck-legality gates remain open.
### Completion criteria
Met as a decision record: ADR-0009 captures answers, later confirmations and explicit deferrals. Implementation/proof is tracked separately by GD-300-002, GD-400-001 and GD-500-001; closing this ticket does not claim those systems exist.
### Related reading
[Current answers and boundaries](decisions/ADR-0009-new-game-and-integration-boundaries.md), [technical proof](CONTINUATION_TECHNICAL_PROOF.md), [first approved subset](decisions/ADR-0008-approved-supply-rules.md), and [Phase 2 implementation record](OVERHAUL_PHASE_2.md).
### Engineering notes
Keep owner comments intact. ADR-0009 supersedes conflicting passing/UI ownership assumptions; no source promotion or engine patch follows from closing this decision ticket.

## GD-300-001 — Implement approved supply accounting prototype

### Purpose
Turn the approved supply rules into a small, testable accounting component before designing weighted packs or integrating multiplayer.
### Expected outcome
Shared and personal limits, per-player singleton, private selected-only consumption, immutable release references, explainable outcomes and safe repeat requests.
### Current state
Complete for this bounded prototype. Nine synthetic tests cover the approved four/eight-player tribal endpoints, draft-unique categories, duplicate destruction, personal staples, private selections, shared exhaustion, replay identities and defensive input checks. The composite legacy verification also runs these tests.
No live runtime hook, database change, pack scorer, real cube tagging or automated shortage fallback was added. This is not the Phase 2 exit gate.
### Open questions
None for the historical accounting subset. ADR-0009 resolves later supply rules; GD-300-002 will implement them. Real curated slice selection and score calibration remain later Phase 2 work.
### Completion criteria
The supply tests pass; a repeated allocation cannot spend another copy; an exhausted selection cannot grant a card; no player pool can contain a duplicate. Legacy artifacts and default runtime remain unchanged.
### Related reading
[Approved supply rules](decisions/ADR-0008-approved-supply-rules.md) and [Phase 2 scope and verification](OVERHAUL_PHASE_2.md).
### Engineering notes
Implementation is `src/gulchdale/supply.ts`; tests are `test/gulchdaleSupply.ts`. Run `npm run build-server && npm run test-supply`. Canonical card identities must not be replaced by printing IDs. The in-memory audit is a prototype, not the persistent Phase 7 telemetry system.

## GD-300-002 — Prove immediate pack generation and replacement rewards

### Purpose
Prove the new pack and scarcity rules without making the new game depend on the legacy draft controller or browser.
### Expected outcome
A seeded headless simulator with atomic offer holds, legal selections, smaller tribal offers, deliberate decline burns, replacement rewards, rotating priority and replayable explanations.
### Current state
Next, not implemented. GD-300-001 is historical accounting coverage; it does not yet reserve open offers or generate packs. ADR-0009 supplies the resolved rules, including the approved review amendments.
### Open questions
No supply-rule question blocks the bounded engineering proof. Real card/archetype selection and balance calibration remain content-review gates; synthetic fixtures are not approved cube content.
### Completion criteria
At least 10,000 four/eight-seat scenarios replay identically; category supply and pool singleton never fail; competing offers cannot overbook cards; replacement failures preserve boosters. Produce traces and an operator summary, with legacy/ecosystem gates green.
### Related reading
[Proof A](CONTINUATION_TECHNICAL_PROOF.md), [approved boundaries](decisions/ADR-0009-new-game-and-integration-boundaries.md), and [Phase 2 evidence](OVERHAUL_PHASE_2.md).
### Engineering notes
Keep this under the new domain/harness, not Session.ts or the Campfire UI. Record release/configuration/seed/state identities, candidate scores and reservation events. Distinguish temporary holds from permanent exhaustion. No new runtime cutover or source promotion.

## GD-400-001 — Prove authoritative all-player phase and recovery barrier

### Purpose
Make shared drafting and private journeys one recoverable session, rather than letting a hidden button or timer determine when the game advances.
### Expected outcome
Four simulated seats enter private choices, preserve pending disconnected choices, and return to shared immediate packs only after every seat is ready.
### Current state
Not started; Phase 3 follows the Phase 2 domain proof. Existing legacy timer pause is not this barrier.
### Open questions
Real Expedition scripts, pacing and Adornment permissions remain GD-400-901 decisions. The technical proof uses non-production labels and explicit fixtures, not invented playable content.
### Completion criteria
Three completed seats cannot advance past an unfinished fourth. Recovery restores the same offer; duplicate/stale/out-of-order commands cannot allocate twice or cross phases. The next shared stage opens exactly once after all seats complete.
### Related reading
[Proof B](CONTINUATION_TECHNICAL_PROOF.md), [phase boundary](decisions/ADR-0009-new-game-and-integration-boundaries.md), and [Expedition owner gate](decisions/ADR-0007-open-game-rules.md).
### Engineering notes
Prove the actual independent domain state machine, not a browser-only modal or a mocked timer flag. Validate session/phase/offer references and in-flight actions, including bot seats. No automatic disconnected private selection.

## GD-500-001 — Prove scene-based card primitives and reward adapter

### Purpose
Establish that low-level card functionality and selected backend capabilities can serve the new game's scenes without importing legacy screens or gameplay workflow.
### Expected outcome
An isolated scene-based proof with a landscape, dialogue and floating cards; a hideable pool; private rewards/direct gifts; and safe four-client recovery and return to shared play.
### Current state
Not started; Phase 4 follows domain/orchestrator gates. Reuse of reviewed card primitives is approved, but their integration and dependency isolation have not been proved.
### Open questions
Audit the exact card cache, popup emitter, global styling and backend projection dependencies before choosing the minimal patch surface. Whole legacy-screen reuse is not an option. Full deck/Adornment legality remains GD-500-901 scope.
### Completion criteria
Actual connected clients select in a bounded floating pack, hide/show their pool without loss, receive a gift without a normal pack pick, disconnect/recover without duplication, and resume shared play only at the all-player barrier. Export and authoritative ownership reconcile; legacy tests remain green.
### Related reading
[Proof C and evidence](CONTINUATION_TECHNICAL_PROOF.md), [current boundary ADR](decisions/ADR-0009-new-game-and-integration-boundaries.md), and [amended domain ownership](decisions/ADR-0003-domain-and-engine-boundary.md).
### Engineering notes
Build a new isolated entrypoint, not an iframe or restyled legacy App.vue/App.ts. Use narrow presentation/command adapters; a client addCards event is not a grant and timer pause is not phase safety. Demonstrate real chosen adapters, preserve attribution, and record patches. No production cutover.

## GD-400-901 — Decide the first Expedition and Adornment limits

### Purpose
Choose a small, understandable adventure that shows how a player's answers affect their draft and color permissions.
### Expected outcome
An approved first Expedition script with named questions, locations, rewards, pacing, and Adornment eligibility/limits.
### Current state
**Adopted:** players retain four commanders and mark a leader; Choice Packs are private and never pass. Shared stages wait for every player. A disconnected private question/choice pauses for recovery rather than receiving an automatic answer.
**Proposed, not approved:** begin with a few locations and one rule-changing reward. Small private option pools and influence targets are hypotheses, not settled counts or balancing rules.
Phase 3 is Not started; no Expedition content has been implemented.
### Open questions
- What exact opening script, location choices, and two meaningful questions should the first playable journey use? Which questions are shared and which are player-specific?
- Where should intermissions occur, and how long should the first experience take? Which timing decisions are first-slice settings versus later playtest calibration?
- Can a narrative answer be mechanically neutral, or must every answer affect signals or permissions? What feedback makes the consequence understandable without revealing the whole scoring system?
- How many private options and retained rewards should each first-script choice offer?
- How many permanent color expansions may a player obtain, which colors may they open, and what eligibility restriction applies to a beginner using a two-color leader?
Barrier and disconnected-private-choice behavior are already answered; this ticket must not reopen them as unresolved choices.
### Completion criteria
The owner approves the actual first script and examples of resulting signals, rewards, and color permissions. The independent orchestrator can implement it without inventing content, counts, or eligibility rules.
### Related reading
[Expedition decision record](decisions/ADR-0007-open-game-rules.md), [World/Expedition and player-state design](architecture/SYSTEMS_MAP_v1.0.md), and [Design Charter](architecture/DESIGN_CHARTER.md).
### Engineering notes
Blocking gate: Phase 3. Record narrative wording separately from mechanical effects. No forced auto-resolution for disconnected players.

## GD-500-901 — Decide commander and deck-rule details

### Purpose
Make the deck a player takes to the table unambiguous, especially when four commander options and an Adornment remain available.
### Expected outcome
An owner-approved legality record with worked legal/illegal decks, commander roles, card counting, and explicit permissions.
### Current state
**Adopted:** 60-card decks, 30 life, four retained commander options, one marked leader, and per-player final-deck singleton for non-basic cards unless an explicit rule changes it. Adornments can grant off-color permission for that draft.
The normal basic/non-basic distinction is not a new global singleton restriction. The Charter's format direction is settled; exact counting and exception representation still need clarification.
**Proposed, not approved:** model permission explicitly while possibly displaying a physical Adornment as a separate reference card.
Phase 5 is Not started; the legacy flow has not been converted to these new validation rules.
### Open questions
- Which of the four retained commanders may occupy the command zone during a game: only the marked leader, a chosen option, or a specifically defined combination?
- Where do the other commander options live, and which commanders count toward the 60-card deck? Can a player change leader after drafting, and when are permissions recalculated?
- Does the physical Adornment count as a deck card, a separate reference card, or another game object? What does export show?
- How exactly do leader colors, Adornment permissions, and explicit format exceptions combine? Which exception cases must validation and export explain to players?
- How should permitted repeated basics and any expressly granted non-basic exception be represented consistently in the digital deck and tabletop instructions?
These questions clarify representation and play rules; they do not ask whether cross-player duplicates should be forbidden.
### Completion criteria
The owner approves worked examples covering commander placement/counting, color permissions, repeated basics, explicit exceptions, and Adornment export. Deck validation can give a human-readable reason for each rejection.
### Related reading
[Deck-rule decision record](decisions/ADR-0007-open-game-rules.md), [Deck Construction and Game design](architecture/SYSTEMS_MAP_v1.0.md), and [format intent](architecture/DESIGN_CHARTER.md).
### Engineering notes
Blocking gate: Phase 5 legality acceptance. Do not infer command-zone combinations or a 61st-card rule from a recommended physical representation.

## GD-800-901 — Decide identity, privacy, and personalization limits

### Purpose
Give returning players continuity while making clear what Gulchdale remembers, how they control it, and how little that history is allowed to steer their next draft.
### Expected outcome
An approved anonymous-identity and learning policy covering recovery, retention, consent, deletion/export, evidence, and influence limits.
### Current state
**Adopted:** accounts are not required initially; current Expedition/questionnaire choices dominate personalization. Ability does not change mid-draft. Preferences should be evidence-backed rather than permanent labels.
**Proposed, not approved:** persistent anonymous identity first, optional accounts later, and a mild pet-card influence target around 15% for testing. Neither that target nor the roughly 35% random-experience target is an approved production constant.
Phase 8 is Not started. No new persistent player profile or account system has been added.
### Open questions
- How does anonymous identity persist and recover after browser storage is cleared, a device changes, or two people share one device? What recovery is intentionally unsupported without an account?
- What may be collected by default, what requires consent, and what must the player be told before learning begins?
- How long are identity-linked events and learned preferences retained? How do deletion, export, and anonymization work without rewriting historical draft facts?
- May players inspect, correct, disable, or reset learned preferences? How are explicit favorites kept separate from observed behavior?
- How much evidence and confidence are needed before a preference affects generation, and how should evidence carry across a major rules/pool release?
- What approved caps and balancing safeguards prevent pet cards, experience estimates, or old archetypes from overpowering current choices?
### Completion criteria
The owner approves a readable policy and examples for recovery, consent, deletion/export, inspectability, evidence thresholds, and influence caps. Public-retention choices are linked to telemetry and deployment work, not guessed.
### Related reading
[Identity/privacy decision record](decisions/ADR-0007-open-game-rules.md), [player-profile and telemetry design](architecture/SYSTEMS_MAP_v1.0.md), and [player-autonomy intent](architecture/DESIGN_CHARTER.md).
### Engineering notes
Blocking gate: Phase 8 persistent learning. Mailpit captures development account mail only if accounts are later approved; no production delivery or mandatory authentication is implied.
