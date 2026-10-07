# ADR-0010: experience policy, curation evidence and commander-owned packages

Status: Accepted owner direction and bounded rules; implementation not started.
Related gates: GD-300-902, GD-400-901, GD-500-901, GD-800-901.
This amends ADR-0009 where stated; legacy behavior and proof receipts are unchanged.

## Authority, provenance and protected research

The owner reviewed the philosophy assessment, supplied rule clarifications and
Q01–Q03 answers, and explicitly requested their incorporation in this chat on
2026-10-06 (America/Los_Angeles). These messages are the reviewed source.
The owner also reports posting Q01–Q03 to GD-300-902. Its v1 comments API returned
zero comments at review time; no comment ID or timestamp is fabricated. The chat
answers suffice for this expressly authorized review. Existing comments remain intact.

[Gulchdale Philosophy](http://10.60.0.227:8105/doc/gulchdale-philosophy-wmw1L6OyZZ)
is in the owner-authored Outline collection **Gulchdale Game Design and Balance**.
That collection preserves curation ideas, choices and player-experience/marketing
intent, not executable technical definitions. Never edit, normalize, overwrite,
move or delete the owner's handwritten sections. Link them as design inputs;
publish engineering translations in the separate synchronized Gulchdale collection.
The owner allows additional research pages but none is created by this amendment.
Repository Markdown remains authoritative for reviewed engineering contracts.
The protected [Decisions Needing Attention for Implementation:](http://10.60.0.227:8105/doc/decisions-needing-attention-for-implementation-DS5U2fcPMu)
page corroborates the chat answers and specifies hand-curated signatures for now,
not a mid-draft conversion mechanism. Its unanswered first-slice question is
answered conditionally by the owner's subsequent chat message; neither page is edited.

## Experience and curation direction

- Audience: relative beginners through veterans, neither a teaching tool for
  absolute beginners nor a professional-player environment.
- Tribes are approachable entry points; the Main Deck is a shared mechanical
  substrate. Support should connect multiple decks rather than require a named
  commander-specific archetype. This does not approve a launch tribe/card list.
- High synergistic ceiling and low generic ceiling are curation goals. No
  automatic power, salt or difficulty rating follows from that wording.
- Translate "fully coherent deck" into **strong guidance through heavy weight
  impacts**, not a guarantee. Strengths and formulas remain explicit experiments.
- Fewer than 36 spells after deckbuilding, inadequate two-color mana support,
  and failure to offer a meaningful curve peaking around mana value 2–3 are
  cube-list experience indicators. Distinguish poor offers from a player's choices.
  These indicators do not add curve/fixing/spell-count weighting, live correction,
  forced picks or a new deck-legality requirement. Exact spell counting and review
  thresholds are still open; the earlier 36/24 calibration is not a legality gate.
- Inadequate support/scarcity becomes a failed-condition flag with supply
  diagnostics and the choices/offers leading to it. No new automatic in-draft
  intervention, supply creation or reroll is authorized. The existing explicit
  ADR-0009 tribal replacement rules remain adopted; this flag does not repeal them.
  Whether the owner intends to change those older rules remains a follow-up question.

## Lobby mode and personal experience

- Individual experience recommends difficulty; joining a harder lobby is a
  willing override. A beginner is not barred from Veteran-lobby commander content
  solely by a personal label. This supersedes that implication in the philosophy.
- Lobby mode determines commander content. Beginner and Intermediate commander
  pools explicitly exclude three-color commanders. The exact approved Veteran
  roster and treatment of commanders with more than three colors remain open.
- Veterans may intentionally host easier drafts. The mechanism for choosing mode
  (host, vote or averaging), guidance coefficients and individual experience input
  are not approved by this direction. Averaging lobby level remains a hypothesis.
- Personal Adornment eligibility is determined by player level, independently of
  choosing a harder lobby. Exact color caps and permissions remain GD-400-901 and
  GD-500-901 decisions; no three-color Adornment prohibition is inferred here.
- Beginner tribal emphasis, intermediate variety and veteran commander-driven
  exploration inform research profiles, not hard-coded numeric constants.
- Defection remains experimental, including in Intermediate-oriented research.
  "Passing" language is historical/player-facing only: packs still resolve
  immediately and do not circulate. No legacy screen becomes a design reference.

## Commander-owned signatures and support

- Every commander has an optional signature slot; empty slots are valid and many
  commanders may have none. Signature and support relationships are curated data.
- A commander owns its signature and support cards exclusively. An attachment
  cannot belong to another commander or occur in Main Deck, tribal, utility,
  reward, fallback or other independently draftable pools. Validate canonical
  identity across printings; duplicate printings cannot evade exclusivity.
- These cards are automatic commander-package grants on selecting that commander,
  not competing ordinary draft supply or universal per-player commander staples.
  Track entitlement, allocation, provenance and singleton despite their exclusion
  from pack supply. No extra category-wide multiplier or replenishment is implied.
- Legacy evidence: Atla Palani owns Thornbite Staff; Baba Lysaga's Notes reference
  Crop Rotation and Mishra's Factory, Mishra's Foundry, Inkmoth Nexus and Blinkmoth
  Nexus. `spawnedByDraftEffect` identifies injection-only rows. Notes and tags are
  historical import evidence, not free-form modern execution instructions.
  The legacy generic Signature Spell marker is not an approved modern ability.
- The commander used in the deck counts as card 1 of 60; its signature, if present,
  counts as card 2. A signature is not required. Counting/placement of other
  retained commanders and support cards remains an explicit legality question.
- A designated signature begins in the command zone. Once cast, it follows normal
  resolution/zone behavior, including other effects changing that outcome. There
  is no automatic return or newly imposed whole-game recasting prohibition.
  Gulchdale is not an MTG gameplay/casting engine; tabletop players enact play rules.
- For now signatures are entirely hand-chosen during cube curation, not converted
  from arbitrary drafted spells mid-draft. The owner considers the legacy mechanism
  too strong; a future version is a stretch goal at most, not current scope.

## Authority and architecture

Gulchdale owns tribe/Expedition selections separately from commander packages.
Its session state records retained commanders, leader, attachments and drafted
inventory, distinguishing ownership, designation and deck placement. New UI must
clearly show earned signatures/support; players must not consult the cube or owner
to discover them. Draftmancer handles only chosen card/transport projections.

Engineering translation: record grants when earned, atomically and idempotently;
derive final deck/export from authoritative state and append-only events, not by
reconstructing ownership from Draftmancer logs at submission. Whether a package is
projected into Draftmancer immediately or at submission is an adapter decision still
to prove. It must never delay the authoritative record or player-visible entitlement.
Support must be visible while planning the deck even if the engine projection waits.

Proposed event vocabulary includes commander selected, package granted and leader
marked. Names are illustrative, not an adopted API schema. Pool projections and
external logs supplement, never own, the Gulchdale record.

## Budget and availability

Early research has a soft $1,000 all-in target, not a failed-list criterion.
Actual early cost may exceed $5,000; the owner estimates existing Gulchdale at
$5,000–$12,000. Current practical supply is the owned collection plus a few small
purchases. Future public deployment has a hard $1,000 ceiling, preferably lower.
These are owner estimates/intent, not fetched valuations or price guarantees.
What "all-in" includes and how owned cards are priced remain open. Price
optimization, shopping, physical reconciliation and substitution remain Phase 10.

## Sequencing, proof and remaining questions

The owner wants curated signatures in the first playable slice if infrastructure
can support them safely; otherwise defer explicitly. This is conditional scope,
not proof that signatures are ready. Do not pull every Phase 9 advanced feature
forward. No implementation is authorized by this documentation-only incorporation.

- Phase 2 follow-up: explicit package schema, attachment exclusivity, atomic grants,
  replay/singleton and mixed-mode offer-policy experiments. Existing proofs do not
  establish these additions. Reject conflicting packages before starting a draft.
- Phase 3: Gulchdale-owned mode, tribe, commander/leader and pending package state;
  safe all-player recovery barriers. Persistent skill learning is not prerequisite.
- Phase 4/5: clear earned-package presentation, safe adapter projection, deck
  counting, command-zone designation, recovery and export from authoritative state.
- GD-700 later projects immutable diagnostic events into curation reports;
  GD-800 retains experience/privacy decisions; GD-900 retains public buildability.

Signature gate: selection grants its package once; repeated messages/recovery grant
nothing extra; attachment cards never appear elsewhere; earned cards are visible;
final export reconciles the selected deck and approved command-zone rules. If this
gate cannot be met for the slice, document deferral rather than silently dropping cards.

Open questions are numbered R01–R08 in the [questionnaire](../RESEARCH_QUESTIONNAIRE.md)
and assigned to existing owner tickets. In particular: which retained signatures
are command-zone eligible, leader changes, attachment color permissions, physical
versus deck membership, mixed-mode setup, measurable failure criteria and any
intended repeal of replacement behavior remain unresolved. Phase 2 stays Building;
Phases 3/4 stay Not started. Legacy runtime, code, inputs and recovery tags stay intact.
