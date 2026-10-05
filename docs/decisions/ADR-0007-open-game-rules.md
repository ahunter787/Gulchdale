# ADR-0007: unresolved rules and owner gates

Status: Partially resolved; implementation must stop at each remaining relevant gate.

Accepted format direction: per-player final-deck singleton, scalable virtual supply,
60-card decks, 30 life, four retained commanders and one marked leader,
Adornment-based color expansion, native private ChoicePacks.
These do not retroactively change the working four-stage legacy flow.

This is the decision record, not an approval of the proposed answers. The
[human-readable work catalog](../WORK_ITEMS.md) publishes the same owner gates inside
Plane with context, deliverables and completion criteria. Questions below remain open
until the owner approves an explicit decision; implementation stops at the relevant gate.

## GD-300-901: virtual supply and reservations — Phase 2

Owner answers received 2026-10-05. [ADR-0008](ADR-0008-approved-supply-rules.md)
records the adopted category limits, selected-only private consumption, strict pool
singleton and injection accounting. Phase 2 may begin with that bounded subset.
The questions below are the original review checklist, retained as history; the
remaining active questions and approved examples are listed in ADR-0008.

Virtual supply is the generator's allowance to offer cards. Physical inventory is
what the playgroup owns; it is reconciled later rather than allowed to dictate simulator
behavior. Two players receiving the same card is already allowed. Final decks remain
singleton for non-basic cards unless an explicit rule grants an exception.

Original proposed policy categories (historical, superseded by ADR-0008): global-unique, per-player-singleton,
player-injection-only and unlimited-exception. Scaling by pool/archetype instead of
one multiplier is a recommendation. The foundation currently retains imported quantities.

Original decision checklist:

- Set concrete four-player allowances for ordinary cards, commanders, scarce archetype
  pieces and personal packages; define how those allowances scale or are deferred for 2-8 players.
- Identify shared session supply versus personal supply, unique cards and exceptions.
- Choose when generation reserves supply, and when unpicked private options, discarded
  passing cards, canceled packs or recovery requests release or retain it.
- Choose shortage behavior: explicit failure, approved fallback, smaller pack, or another
  expressly approved policy. An implementer may not choose one silently.
- Decide whether drafted pools may contain duplicates while final decks remain singleton,
  and how generation/passing treats a card already owned by that player.
- Decide whether personal injections consume shared supply or a separate allowance;
  explain unique commander packages and two players pursuing the same tribe.

Approval requires worked examples for shared demand, abandoned private options,
exhausted candidates and repeated generation/recovery. Later pack-size calibration
and physical reconciliation may stay research, but their deferral must be recorded.

## GD-400-901: first Expedition and Adornment limits — Phase 3

Already adopted: four retained commanders, one marked leader, private non-passing
Choice Packs, an all-player barrier before shared play resumes, and paused private
choices on disconnect rather than automatic answers. Older open questions about those
barriers in the source map are resolved by the adopted overhaul plan.

A few locations and one rule-changing reward are proposed first-slice scope, not an
approved script or count. Open decisions:

- Approve actual opening/location content and at least two meaningful questions;
  distinguish shared questions from private ones.
- Place intermissions and set first-slice pacing; identify what remains playtest calibration.
- Decide whether narrative choices can be mechanically neutral and what consequences
  players should see without exposing the entire scoring model.
- Set the private option counts and retained reward counts for the first script.
- Set permanent color-expansion limits, eligible colors, and the ability restriction for
  a beginner choosing a two-color leader.

Approval includes the complete first script and examples of resulting signals,
rewards and permissions. No implementer invents question wording or mechanical counts.

## GD-500-901: commander and deck-rule details — Phase 5

Already adopted: 60-card decks, 30 life, four available commander options, one marked
leader, Adornment-based off-color permissions and non-basic final-deck singleton with
explicit exceptions. The ordinary basic/non-basic distinction is not a global copy cap.

Explicit permission validation and a possibly separate physical Adornment reference
card are recommendations, not a settled 61st-card rule. Open decisions:

- Define which commanders may occupy the command zone and which combinations are legal.
- Place the other retained commanders and define which count toward the 60 cards;
  decide whether/when leader changes are allowed and permissions recalculated.
- Define whether Adornment is a counted deck card, a separate reference card, or another
  game object, including how it appears in export.
- Define how leader colors, Adornment permissions and explicit exceptions combine.
- Specify consistent digital/tabletop representation of repeated basics and any granted
  non-basic exception rather than reopening the settled cross-player-duplicate direction.

Approval requires legal/illegal deck examples and understandable validation/export reasons.

## GD-800-901: identity, privacy and personalization — Phase 8

Already adopted: accounts are not mandatory initially, current Expedition choices
dominate personalization, and ability does not change mid-draft. Persistent anonymous
identity first and evidence/confidence-backed preferences are the intended direction;
recovery, privacy and actual influence limits still need approval.

Open decisions:

- Define recovery after browser storage loss/device changes and separation on shared
  devices; explain what cannot be recovered without an account.
- Define default collection, consent and the explanation shown before learning begins.
- Set retention periods and deletion/export/anonymization behavior without rewriting
  historical draft facts; link public retention to telemetry/deployment work.
- Decide whether players can inspect, correct, disable or reset learned preferences,
  keeping explicit favorites distinct from observed behavior.
- Set evidence/confidence thresholds and carry-over behavior across major releases.
- Approve caps and safeguards for pet cards, experience estimates and past archetypes.

Approval requires a readable policy and worked privacy/recovery/influence examples,
not merely a new identifier field or an account form.

Approximately 35% random influence and 15% pet-card influence are experimental targets,
not baked-in game rules. No mid-draft ability changes. Shared stages require an all-player
barrier; disconnected private choices await recovery rather than automatic resolution.
Do not invent answers in order to clear these tickets.

## Engineering notes

When an owner resolves a gate, record the approved rules in an accepted ADR, link it
here and in the corresponding catalog entry, update roadmap status, then synchronize
Outline and Plane. Recommendations must remain labeled until approval. No new runtime
or game rule is introduced by documenting these questions.
