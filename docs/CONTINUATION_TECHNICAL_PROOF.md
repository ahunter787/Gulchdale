# Continuation technical proof: new scenes, one authoritative session

Status: A verified as a bounded synthetic engineering proof; B/C specified, not started. Governing amendment:
[ADR-0009](decisions/ADR-0009-new-game-and-integration-boundaries.md).
Later design amendment: [ADR-0010](decisions/ADR-0010-experience-policy-and-commander-packages.md).
The following new package/policy gates are specified, not implemented; they do
not retroactively expand the verified A corpus.

## Follow-up proof boundaries from owner research

- Phase 2: canonical attachment exclusivity across printings, no attachment in
  unrelated/fallback pools, atomic commander-plus-package grants, singleton and
  exactly-once replay. Mixed-mode experiments must retain shared rotating
  priority/holds while resolving explicit mode and personal permission inputs.
- Phase 3: separate tribe/Expedition and commander-package state; record ownership
  when earned, not by parsing Draftmancer logs at submission. Personal experience
  recommends lobby choice; exact Adornment limits still require decisions.
  Recruitment/Expeditions now need authoritative sequential turns, unique tribe
  allocation and owner-scoped recruitment/discovery. General Hire cannot expose
  another tribe's exclusive subset. Preserve the active turn on disconnect.
- Phase 4/5: show earned signatures/support clearly, retain them through recovery,
  distinguish ownership from command-zone/deck placement and export from Gulchdale
  authoritative records. Pool projection timing is an adapter decision to prove.
- Curation diagnostics trace inadequate support to offered/selected cards and
  actual supply. Do not invent curve/fixing corrective weighting, automatic rescue
  or balanced-deck guarantees. Operational metrics remain owner research.

Curated signatures are conditional first-slice scope if the package/visibility/
recovery/export gate passes. Otherwise document deferral; broader Phase 9 features
are not pulled forward. GD-500-901 must resolve retained-signature command-zone,
leader-change, color and counting details before claiming playable legality.

## What the proof answers

Can independently generated immediate packs and private rewards share one player
inventory, appear inside entirely new scenes, and return all players to a shared
stage without loss, duplication or inherited legacy UI workflow?

The answer must come from an executable demonstration and automated checks, not
from existing pause/addCards functions being present. Those are integration
candidates; their existence does not prove barrier safety or replay correctness.

## A: Phase 2 domain proof — GD-300-002

Implementation commands and independent-worker setup:
[Phase 2 worker handoff](PHASE2_WORKER_HANDOFF.md). This implementation is an
offline synthetic proof, not new live application behavior.

Verified on 2026-10-06 at implementation checkpoint `3a9e296`: 10,000 distinct
four/eight-seat scenarios and 10,000 independent command replays, zero failures;
34 focused tests and the composite preservation gates passed. The [operator
summary and limitations](OVERHAUL_PHASE_2.md) distinguish this result from real
content/balance approval and the unimplemented B/C integration proofs.

Build a headless harness using explicit four/eight-seat rosters, immutable release
references, versioned simulator settings and seeds. Start with labeled synthetic
fixtures near 20 commanders, 100 cards and six archetypes; do not claim real balance.

Implement immediate offers with atomic generation/holds, selection, release,
explicit session burns, deliberate decline and replay. Enforce per-player pool singleton,
category capacities, and no overlap of draft-unique cards in competing offers.
Report temporary contention separately from exhausted eligible supply.

Scoring uses configurable base weights and normalized affinity contributions,
with 0.5 neutral and human overrides first. Initial unguided scenarios use uniform
weights; guided cases explicitly supply experimental parameters. Record all
eligibility reasons, score contributions, random draws and reservations. Do not
adopt 35% randomness or pet-card targets as constants.

When permanent tribal supply is smaller than requested, offer remaining options
if they meet retained count. Otherwise select a legal same-size replacement
from ranked configured archetypes, with stable identifier tie-breaking. Preserve
the booster until selection succeeds. If no equivalent pack exists, return an
explained unfulfillable result and spend nothing. Decline burns one player-chosen
held copy, releases others, preserves the booster and closes the opportunity without
a reroll. Technical failures/disconnects do not burn. Replay must not double-charge
or double-burn. Pack sizes and retained counts are explicit harness settings, not
production content decisions.

Use seeded initial seat order with rotating first priority between shared stages.
Cards have one supply policy regardless of tribe/archetype memberships. Hash the
actual fixture, settings and simulator identity, not unrelated legacy releases.
Supplement replay with invariant checks and seed/seat-priority outcome comparisons.

Acceptance: at least 10,000 scenarios across four/eight seats replay identically
from the same inputs/actions; accounting never exceeds capacity; selected cards
are the only ordinary permanent consumption; burns and replacement rewards follow
the configured policy. Provide JSON traces and a concise operator summary.

Output is an offline simulator. No Campfire screen, application socket hook,
live release promotion, production bot filling or backend engine patch is needed.
Real small-slice review remains a Phase 2 content/balance exit gate.

## B: Phase 3 orchestrator proof — GD-400-001

Use four simulated seats and non-production scene labels to demonstrate:

1. With an explicit proof-only seat order, the active seat answers Tribe/Hire,
   receives an owner-eligible offer and commits its selection/package once.
2. Closing recruitment releases unselected holds without burning. Generate the
   next recruitment offer from updated tribe availability and consumed-card accounting.
   Expedition location stock instead persists after its selection window closes.
3. Only the active seat can make a supply-affecting recruitment/Expedition choice;
   reject other seats and stale turn/phase/offer references server-side.
4. Three seats complete their required turns; the fourth disconnects while reading.
   Both its turn and offer remain pending, and the next phase stays blocked.
5. Restore that same turn/offer, complete it once and reject duplicate deliveries.
6. Every seat reaches the barrier; the next configured phase opens exactly once.
   Main Deck simultaneity and later-round priority remain R09 owner decisions,
   not invented by this fixture. No actual pack circulation is introduced.
7. Explore publicly reveals fixed location stock and commits one pick plus one
   shared-clock decrement atomically. Return shows that same remaining stock,
   commits one eligible pick and does not decrement the clock. No replenishment.
8. Empty or player-ineligible locations cannot be selected. At zero explorations,
   preserve one final opportunity per seat; record forced skips without compensation.
   Final order and counts are explicit proof fixtures pending R15, not adopted rules.
9. Reconnect/replay restores location inventory, clock, public discovery history,
   active turn and final opportunities. Reject stale claims for already-taken cards;
   prevent stock from being independently allocated in another offer. An exhausted
   location remains in history. Duplicate Explore cannot spend clock or grant twice.

Transitions refer to session, phase and offer identities. Commands are validated
against current state; in-flight actions and simulated bot seats cannot cross the
barrier. Snapshot/replay restores the same ownership and pending choices. Test
duplicate commands, out-of-order messages, interruption and reconnect.

This remains independent of Draftmancer and does not approve real Expedition
scripts, pacing, counts or Adornment permissions. Those remain GD-400-901 decisions.
Current PackSimulator/workbench tests do not prove persistent locations. Later
content simulations must measure length, unexplored/unclaimed resources, forced
skips, seat advantage and the last explorer's influence. Before a playable slice,
R17 must establish sufficient Main Deck opportunities without Expedition rewards;
no automatic catch-up grant is introduced by this proof plan.

## C: Phase 4 scene and adapter proof — GD-500-001

After A/B pass, create an isolated new-game test entrypoint backed by the actual
phase/offer/ownership contracts. Do not mount or restyle the legacy App page.
Keep the legacy entrypoint operational and default; no runtime cutover.

Use a simple settlement/landscape placeholder, dialogue panel and floating card
offer. Adapt reviewed image/zoom/selection primitives behind new presentation
interfaces; isolate legacy emitters, caches, CSS and socket assumptions. A scene
view model receives projected state and submits commands; it never allocates cards
or advances shared phases itself.

Demonstrate four test browser clients: active-player recruitment/Expedition scenes,
inactive-seat public observation of questions/offers/picks/unchosen options with
no action authority, explicit Tribe/Hire entry orders, earned package visibility,
hidden pool presentation, one disconnect, recovery, then all-player progression.
Any simultaneous Main Deck scene is explicitly configured proof scope pending R09.
The pool is merely hidden; showing it again preserves its cards.
Use placeholder dialogue and proof-only option counts, not approved story content.
Show persistent revealed locations, remaining-stock counts and legal Explore/Return
actions without revealing unopened stock or harness scores. A reconnecting observer
receives the same authorized public history; observing never grants pick authority.

Exercise a narrow authenticated/idempotent reward-grant adapter, including a direct
gift that was not picked from a pack. Gulchdale remains the owner/supply authority;
the engine/client pool is a synchronized projection. Verify metadata, disconnected
state, reconnect snapshots and export. Client addCards alone is not a grant.

If an existing Draftmancer capability is reused, prove its behavior through the
adapter. Where in-flight bot or pick behavior cannot be safely contained, report
the precise incompatibility rather than widening the fork or pretending timer
pause is sufficient. Do not start/stop a traditional draft to switch scenes.

Acceptance: floating selection/zoom works within its container; pool visibility
does not affect ownership; rewards survive reload/reconnect; replay grants once;
stale picks cannot cross private phases; shared progression waits for all seats;
the existing legacy acceptance test still passes.

## Evidence and stop conditions

Keep deterministic fixtures, runnable harness/browser checks, replay traces, a
short demonstration recording or screenshots, and a documented adapter patch
manifest. Report exactly which capabilities were reused and which needed isolation.
Run the existing legacy, foundation, compiler, client, Docker and ecosystem gates.

Do not mark B/C complete based on mocks alone: B proves the real domain state
machine; C proves real connected clients and any chosen backend projection adapter.
A technical proof is not a final UI, balanced cube, complete deck-legality system,
playable defector mechanic or approved production cutover.
