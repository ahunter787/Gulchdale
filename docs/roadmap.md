# Gulchdale overhaul roadmap

Repository Markdown is authoritative. Outline and Plane are one-way mirrors.
Human-readable descriptions and unanswered questions: [work-item catalog](WORK_ITEMS.md).
Governing inputs: [Charter](architecture/DESIGN_CHARTER.md), [Systems Map](architecture/SYSTEMS_MAP_v1.0.md).
Current owner amendment: [ADR-0009](decisions/ADR-0009-new-game-and-integration-boundaries.md).
Proof gates: [continuation technical proof](CONTINUATION_TECHNICAL_PROOF.md).
Baseline: `e766438`, tag `gulchdale-legacy-v1.0.0`; branch `codex/overhaul-foundation`.
The previous Phase 1–3 work is legacy/as-built history, not these phases.

## Modules

| Module | Name |
| --- | --- |
| GD-000 | Architecture & Legacy Baseline |
| GD-100 | Data Foundation & Releases |
| GD-200 | Card Graph & External Data |
| GD-300 | Pack Generator & Simulation |
| GD-400 | Draft Orchestrator & Expeditions |
| GD-500 | Draftmancer Adapter |
| GD-600 | Admin / Curation / Publishing |
| GD-700 | Telemetry & Analytics |
| GD-800 | Player Personalization |
| GD-900 | Deployment / Buildability |

## Phase milestones

| Phase | Scope | Module | Status |
| --- | --- | --- | --- |
| 0 | Preserve, audit, establish guardrails | GD-000 | Complete |
| 1 | PostgreSQL data foundation | GD-100 | Complete |
| 2 | Seeded pack simulator on a small curated slice | GD-300 | Building |
| 3 | Independent orchestrator and Expedition state machine | GD-400 | Not started |
| 4 | Thin Draftmancer adapter | GD-500 | Not started |
| 5 | Four-player vertical slice | GD-500 | Not started |
| 6 | Curation, staging, releases and rollback | GD-600 | Not started |
| 7 | Append-only telemetry and health projections | GD-700 | Not started |
| 8 | Anonymous identity and evidence-backed player learning | GD-800 | Not started |
| 9 | Advanced systems after real play data | GD-400 | Not started |
| 10 | Buildability, deployment and privacy | GD-900 | Not started |

## Executable tickets

| Ticket | Module | Phase | Title | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| GD-000-001 | GD-000 | 0 | Publish governing documents and legacy labels | Complete | Outline and Plane verify; ten modules; legacy tag |
| GD-000-002 | GD-000 | 0 | Inventory architecture and data flow | Complete | Published Keep/Wrap/Replace Later/Retire inventory |
| GD-000-003 | GD-000 | 0 | Freeze and reproduce the legacy baseline | Complete | Fresh-clone bootstrap; manifest hashes unchanged |
| GD-000-004 | GD-000 | 0 | Golden smoke and stale-player regression | Complete | Four rounds, controls, reconnect, effects, pool and export coverage |
| GD-000-005 | GD-000 | 0 | Verify Draftmancer pin and patch manifest | Complete | Isolated upstream archive; no imported Git history |
| GD-000-006 | GD-000 | 0 | Adopt architecture-boundary ADRs | Complete | DB, domain, sources, ownership and compatibility published |
| GD-000-007 | GD-000 | 0 | Phase 0 review and exit gate | Complete | Composite legacy and ecosystem verification pass |
| GD-100-001 | GD-100 | 1 | Application PostgreSQL and migrations | Complete | Separate service/volume; versioned transactional schema |
| GD-100-002 | GD-100 | 1 | Runtime isolation and domain repositories | Complete | Legacy default; shadow failure nonblocking; orchestrated refused |
| GD-200-001 | GD-200 | 1 | Offline snapshot import and validation | Complete | Input hash/count reconciliation; deterministic staging |
| GD-100-003 | GD-100 | 1 | Immutable releases and reviewed promotion | Complete | Diff/review identities/live pointer; overrides survive refresh |
| GD-600-001 | GD-600 | 1 | Read-only catalog and comparison views | Complete | No browser editing or live content mutation |
| GD-100-004 | GD-100 | 1 | Phase 1 exit gate | Complete | Independent pool; DB tests; legacy and ecosystem green |
| GD-300-001 | GD-300 | 2 | Implement approved supply accounting prototype | Complete | Category limits, singleton, private selection and replay tests; no runtime integration |
| GD-300-002 | GD-300 | 2 | Prove immediate pack generation and replacement rewards | Complete | 10,000 seeded scenarios/replays; atomic holds, burns, booster-preserving alternatives; composite gates |
| GD-400-001 | GD-400 | 3 | Prove authoritative all-player phase and recovery barrier | Not started | Four seats, stale action rejection, disconnected private recovery and exactly-once return |
| GD-500-001 | GD-500 | 4 | Prove scene-based card primitives and reward adapter | Not started | New isolated scenes, floating packs, pool visibility, direct gifts and real client recovery |

## Owner decisions (stop at the relevant gate)

| Ticket | Module | Phase | Title | Status | Acceptance |
| --- | --- | --- | --- | --- | --- |
| GD-300-901 | GD-300 | 2 | Approve virtual supply scaling and reservations | Complete | ADR-0009 records owner answers, immediate packs and explicit content/research deferrals |
| GD-400-901 | GD-400 | 3 | Approve first Expedition and Adornment limits | Not started | Owner ADR; pacing, questions and private selection counts |
| GD-500-901 | GD-500 | 5 | Approve deck legality and commander exceptions | Not started | Owner ADR; 60 cards, 30 life, four commanders, basic exceptions |
| GD-800-901 | GD-800 | 8 | Approve identity retention, consent and caps | Not started | Owner ADR; privacy, recovery and evidence requirements |

Decision context: [ADR-0007](decisions/ADR-0007-open-game-rules.md).
Completed preservation/foundation evidence: [Phase 0/1 exit record](OVERHAUL_PHASE_0_1_VERIFICATION.md).
Phase 2 has a verified synthetic pack simulator; real content/balance review is
still required before the phase exits. [Engineering evidence](OVERHAUL_PHASE_2.md).
[ADR-0009](decisions/ADR-0009-new-game-and-integration-boundaries.md) resolves supply
questions and defines new-game boundaries. Real content review remains a Phase 2
exit gate; Expedition, deck legality and identity remain separate owner gates.

## Sequencing and gates

Phase 0 exits after a fresh clone reproduces the pinned legacy draft without hidden
manual steps. Phase 1 exits after an independent immutable pool reconciles with the
manifest and shadow failure cannot disrupt drafts. Phases 2 and 3 validate architecture
before full-cube tagging or deep engine changes. Start with approximately 20 commanders,
100 cards and 5–8 archetypes. New shared and private packs resolve immediately;
unselected options return to supply unless an explicit session-burn policy applies.
Legacy passing remains unchanged. New UI follows the new game, not legacy screens;
reviewed low-level card primitives may be adapted behind new interfaces.
Shared play resumes at an all-player barrier; disconnected private choices await recovery.

Phase 4 adapter operations: authoritative phase gates, offer/pool projection, new scene
presentation, idempotent reward grants, recovery and complete events. Phase 5 requires four players, four retained
commanders, a marked leader, two questions, one private ChoicePack, a 60-card deck
and a complete audit trail before cutover. Phase 6 adds curation edits/publishing/rollback.
Phases 7–10 follow the Systems Map. Telemetry is append-only; analytics rebuildable.
Mailpit is development email only.

Every phase requires server/client builds, legacy smoke, Gulchdale tests, compiler
reproduction, production Docker build and ecosystem verification.
Legacy is default through Phase 4 and until the vertical-slice gate passes.
Shadow never serves orchestrated drafts. No cutover is authorized here.
Rollback is legacy mode, later also the prior immutable release pointer.
