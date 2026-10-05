# Overhaul Phase 2: pack simulator

Status: Building, not complete. Legacy remains the default runtime.

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

- Approve passing-pack reservation/burn/cancel/recovery rules before its lifecycle.
- Approve tribal exhaustion response and intermediate player-count allowances
  before implementing those cases. The four-player accounting scope is usable now.
- Choose the real approximately 20-commanders/100-cards/5-8-archetypes slice and
  capacities before claiming balance or tagging cards. Do not tag the full cube.
- Implement seeded candidate scoring and complete generation traces as explicit
  experimental simulator inputs, not approved influence constants.
- Build PassingPack and private ChoicePack simulations, then replay and stress
  them against release identities and seeds. Current offers are accounting only,
  not generated/scored packs.
- Resolve live overlapping private-offer contention before Phase 3/4 integration.

No live release was promoted, schema migrated, service restarted or engine file
changed. The legacy land stage remains intact; budget mana-base redesign belongs
to later owner-approved content work.
