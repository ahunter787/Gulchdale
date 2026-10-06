# Overhaul Phase 2: pack simulator

Status: Building, not complete. Legacy remains the default runtime.
Current owner decisions: [ADR-0009](decisions/ADR-0009-new-game-and-integration-boundaries.md).
GD-300-001 below is historical evidence. GD-300-002 is the separate hold-based
implementation; its current verification is recorded under Technical proof.

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

## Historical prototype verification

`npm run build-server && npm run test-supply` runs nine synthetic accounting tests.
These use invented identifiers rather than pretending a curated real cube exists.
The suite is also included in `verify:legacy`, keeping future legacy gates coupled
to these invariants. At that checkpoint ecosystem verification checked the owner
record, ten modules and 29 work items, including exact memberships. The current
32-item verification is recorded below.

On 2026-10-05, `GULCHDALE_PYTHON=compiler/.venv/bin/python DOCKER_BUILDKIT=0 npm run verify:overhaul`
passed: server compilation, client type-check and production build, nine compiler
tests, 21 Gulchdale control tests, eight acceptance/golden tests, five foundation
tests, nine supply tests, production Docker build, three disposable PostgreSQL
tests and ecosystem verification. The second Outline/Plane publication created
and updated nothing. Both legacy tags still resolve to their documented commits;
legacy engine files and compiler inputs are unchanged from the preserved tag.

## Implemented rules and remaining gates

- GD-300-002 implements immediate shared/private offers with generation-time
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
  screen competing offers atomically. The historical GD-300-001 prototype does
  not hold options; GD-300-002 does.
- Prove the all-player barrier independently in Phase 3 and scene/reward adapters
  with connected clients in Phase 4. Neither is currently implemented.

## Technical proof and implementation boundaries

GD-300-002 is complete as a bounded synthetic engineering proof on 2026-10-06.
The implementation checkpoint is local commit `3a9e296`; later evidence-only
commits do not change the executing engine. Run `npm run build-server` then
`npm run test-simulator`; all 34 focused cases pass. The independent
[worker handoff](PHASE2_WORKER_HANDOFF.md) provides exact simulate, explain and
replay commands against an isolated export of that commit.

### Operator result

The full CLI run passed 10,000 distinct scenarios: 5,000 four-seat and 5,000
eight-seat scenarios, seeds 0–4999 for each. All 10,000 fresh-instance command
replays matched, with zero failures and no early abort. Each of eight scenario
families passed 625 times per seat count. All 16 saved full-evidence samples also
passed standalone CLI replay and matched the smoke samples byte-for-byte.

The eight families exercise shared packs, partial tribal rewards, replacements,
unfulfillable rewards, temporary contention, deliberate decline, explicit
remainder burns and full priority rotations. Fixtures contain 20 commanders,
100 noncommander cards, two personal staples and six archetypes. Eight-seat
fixtures use five human seats and three simulated bot seats.

The corpus produced 4,022 distinct selected-outcome signatures. In aggregate
shared/rotation scenarios each four-seat position retained 3,125 cards and each
eight-seat position retained 5,625; every generation position received two options
per offer. First-priority counts ranged from 771–787 at four seats and 697–710 at
eight seats. These diagnostics expose allocation behavior; they do not establish
real card quality, controlled guidance effects or approved game balance.

The [reviewed machine-readable receipt](reference/phase2-proof-receipt.json)
records actual synthetic Pool/Metadata/Rules identities, Node/dependency versions,
seed ranges, metrics and gate results. Executing engine hash:
`185e4d0d990007d882dfcd1513df65fc6afcdb530c132e6e34095f7e7ee3b319`.
Corpus trace hash:
`21101977c9df6ebcf6ecf54fd3df76548571849c1568a41bbe400f8a33bb611a`.
Raw report and 16 detailed samples are temporarily available at
`/tmp/gulchdale-phase2-proof.207SJy`; those generated artifacts are not tracked and
can be reproduced with the handoff commands.

`GULCHDALE_PYTHON=compiler/.venv/bin/python DOCKER_BUILDKIT=0 npm run verify:overhaul`
passed: server compilation, client type-check/production build, nine compiler
tests, 21 controls, eight legacy acceptance/golden tests, five foundation tests,
nine historical supply tests, 34 simulator tests, production Docker build, three
disposable PostgreSQL tests and ten ecosystem content tests. Ecosystem verification
retains ten modules, 32 work items and 31 Outline documents with exact membership
and idempotency checks. Legacy tags and committed legacy inputs remain unchanged.

### Limits and next gate

This verifies eight bounded scenario families with varied seeds, not every possible
input or an independent alternative engine implementation. Replay uses fresh
instances of the same engine; focused tests and independently reconstructed
supply/ownership invariants provide additional checks. Guided/unguided parameters
are experimental, and choices/bots are deterministic fixture actions.

Phase 2 remains Building pending a real reviewed approximately
20-commanders/100-cards/5–8-archetypes slice, its capacities and balance evidence.
No full-cube tagging is authorized. Phase 3's authoritative recovery barrier and
Phase 4's connected scene/reward adapters remain Not started.

[The proof specification](CONTINUATION_TECHNICAL_PROOF.md) separates headless supply
verification from phase/recovery and scene integration. UI is not part of the
Phase 2 harness. Future scene UI may adapt reviewed card-rendering primitives, but
must not mount legacy App.vue/App.ts or use Campfire layouts as a starting point.
Defector mechanics are research only; Main Deck is the current public pool name.

No live release was promoted, existing database migrated, live service restarted
or legacy engine file changed. Database gates exercise the existing migrations
only in their disposable test database. The legacy land stage remains intact;
budget mana-base redesign belongs to later owner-approved content work.
