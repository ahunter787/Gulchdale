# Overhaul Phase 2: pack simulator

Status: Building, not complete. Legacy remains the default runtime.
Current owner decisions: [ADR-0009](decisions/ADR-0009-new-game-and-integration-boundaries.md).
The delivered prototype below is historical evidence, not the new hold-based implementation.

## Delivered first step: GD-300-001

[ADR-0008](decisions/ADR-0008-approved-supply-rules.md) preserves the owner's
GD-300-901 answers and scopes the remaining gates. An isolated supply prototype
implements draft-unique commander/support/main/utility cards, scaled tribal supply
at the approved four/eight-player endpoints, player-specific commander staples,
and strict player-pool singleton.

Private offers consume no capacity; only the selected result is allocated.
Unselected options cannot subsequently be selected from that resolved offer, but
remain available to later offers. Staples are grants, never draftable options.
Idempotent allocation and selection identities prevent repeated requests from
double-spending. Invalid players, cards, identities and conflicting requests fail
before mutation. Immutable release references accompany a defensive-copy audit.

Exhaustion reports `supply-exhausted` with `requiresOwnerPolicy`; duplicate
allocation reports `duplicate-destroyed`. Neither invents a fallback, refund,
tribe-wide saturation inference or multiplayer recovery behavior. This is a
single-process offline prototype, not a database-backed concurrent allocator.

## Verification

`npm run build-server && npm run test-supply` runs nine synthetic accounting tests.
These use invented identifiers rather than pretending a curated real cube exists.
The suite is also included in `verify:legacy`, keeping future legacy gates coupled
to these invariants. Ecosystem verification checks the published owner record,
ten modules and the expanded 29-work-item roadmap, including exact memberships.

On 2026-10-05, `GULCHDALE_PYTHON=compiler/.venv/bin/python DOCKER_BUILDKIT=0 npm run verify:overhaul`
passed: server compilation, client type-check and production build, nine compiler
tests, 21 Gulchdale control tests, eight acceptance/golden tests, five foundation
tests, nine supply tests, production Docker build, three disposable PostgreSQL
tests and ecosystem verification. The second Outline/Plane publication created
and updated nothing. Both legacy tags still resolve to their documented commits;
legacy engine files and compiler inputs are unchanged from the preserved tag.

## Next work and explicit gates

- GD-300-002 is Next: implement immediate shared/private offers with generation-time
  holds, selected-only consumption, explicit burns, deliberate decline and deterministic replay.
- Support exactly four/eight seats; distinguish temporary holds from tribal exhaustion.
  Permit smaller tribal offers that meet retained count; otherwise offer same-size
  legal weighted-archetype alternatives before spending a booster.
  Preserve it if no replacement can be fulfilled.
- Decline burns one player-chosen held copy, releases others and closes the opportunity
  without a reroll. Disconnect and technical rollback never burn. Rotate shared
  generation priority from seeded seat order, including bot seats.
- Choose the real approximately 20-commanders/100-cards/5-8-archetypes slice and
  capacities before claiming balance or tagging cards. Do not tag the full cube.
- Implement seeded candidate scoring and complete generation traces as explicit
  experimental simulator inputs, not approved influence constants.
- Replay/stress immediate pack simulations against release identities and seeds;
  screen competing offers atomically. Current offers do not yet hold options.
- Prove the all-player barrier independently in Phase 3 and scene/reward adapters
  with connected clients in Phase 4. Neither is currently implemented.

## Technical proof and implementation boundaries

GD-300-002 is implemented and under verification. Run `npm run build-server` then
`npm run test-simulator`; 34 focused cases and the 16-scenario CLI smoke corpus pass.
The independent [worker handoff](PHASE2_WORKER_HANDOFF.md) gives exact simulate,
explain and replay commands. Full-corpus and composite-gate results will be recorded
after completion; this paragraph is not a claim that those pending gates passed.

[The proof specification](CONTINUATION_TECHNICAL_PROOF.md) separates headless supply
verification from phase/recovery and scene integration. UI is not part of the
Phase 2 harness. Future scene UI may adapt reviewed card-rendering primitives, but
must not mount legacy App.vue/App.ts or use Campfire layouts as a starting point.
Defector mechanics are research only; Main Deck is the current public pool name.

No live release was promoted, schema migrated, service restarted or engine file
changed. The legacy land stage remains intact; budget mana-base redesign belongs
to later owner-approved content work.
