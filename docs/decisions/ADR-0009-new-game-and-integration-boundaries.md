# ADR-0009: new-game boundaries and immediate-resolution packs

Status: Accepted owner decisions; proof and implementation remain pending.
Related tickets: GD-300-901, GD-300-002, GD-400-001, GD-500-001.
Later reviewed amendment: [ADR-0010](ADR-0010-experience-policy-and-commander-packages.md)
adds lobby recommendations, diagnostic-only curation criteria and exclusive
commander packages. It does not imply these additions are implemented.
Its later amendment makes recruitment/Expeditions sequential and permits
tribe-owned exclusive commander/signature subsets. That supersedes simultaneous
choice assumptions for those phases, not the historical simulator proof or legacy.
Its public-discovery amendment also supersedes private presentation for those
scenes and fresh regeneration of Expedition returns: revealed location stock
persists without replenishment. R15–R17 retain Expedition budgets, singleton/staple
capacity reconciliation and sufficient Main Deck opportunities. Current supply
code remains unchanged pending the explicit capacity amendment.

## Authority and provenance

These decisions supersede conflicting frontend-reuse and passing-pack assumptions
in ADR-0003, ADR-0008 and Systems Map v1.0. Preserve the original Charter and Map as
design inputs, but apply this amendment for current implementation. The PDF stays
an original v1.0 reference, not a regenerated statement of these later decisions.

Supply answers were supplied in
[GD-300-901](http://10.60.0.227:8100/gulchdale/projects/0be43f08-8cb5-4e6d-b6f2-db5223cd1272/issues/36d97f3d-d3f8-483c-8cb2-d92ec0060279).
Comment `96301f58-f7fd-4d1c-859c-58318401000e`, dated
2026-10-06T01:10:05.899091Z, preserves answers Q1-Q6. Defector research appears in
comment `bef7889d-1173-4751-9e78-6184e57ee5af`. Subsequent direct owner decisions in
this conversation confirmed immediate packs, offer-before-spending replacements,
research-only defection, and adaptation of low-level card primitives rather than
legacy screens. Repository Markdown remains authoritative; comments are retained.

## Accepted decisions

- The new Gulchdale is a distinct game inheriting the name, not a redesigned
  legacy screen or legacy gameplay sequence. New scenes and interactions follow
  the new game specification only.
- Reviewed Draftmancer card image, zoom and selection ingredients may be adapted
  behind new interfaces. Do not inherit Campfire layouts, App.vue/App.ts workflow,
  whole-screen deck-builder UI or legacy styling as the design starting point.
- Backend reuse is evaluated independently. Gulchdale owns phases, generation,
  supply, player ownership, permissions, rewards, telemetry and the scene model.
  Draftmancer-derived transport/card-pool capabilities are adapter candidates,
  not a second authority for game rules.
- Sessions have exactly four or eight seats including bots. Five humans require
  three bot seats. Phase 2 represents those rosters; production bot filling is
  later orchestrator/integration work, not a change to the legacy lobby.
- Shared stages use simultaneous immediate-resolution packs. Private rewards
  also resolve immediately. No new pack circulates between players; the original
  PassingPack requirement is superseded for this v1. Legacy passing is untouched.
- Generation atomically screens and holds options before presentation. A hold
  temporarily reduces availability, not permanent supply. Competing open offers
  cannot share a draft-unique card or overbook scaled tribal capacity.
- Selection allocates selected cards and releases unselected holds. Explicit
  configured burn effects remove the remainder for the session instead. Do not
  infer a burn from an ordinary pick or permanently delete a source card.
- Deliberate player decline burns one player-chosen supply copy held in that offer,
  releases other holds, preserves the booster, and closes that earned opportunity.
  It cannot reroll or remove an opponent-owned card. Disconnect preserves the
  offer; technical rollback spends/burns nothing. Commands must be idempotent.
- Warn about tribal allocation and scarcity. If no eligible tribal reward remains,
  offer all remaining eligible tribal options if they still meet the retained count.
  Otherwise offer a same-size legal pack from the player's weighted archetypes.
  Spend a Tribal Booster only after a successful selection; if no replacement
  can be fulfilled, preserve it. Temporary holds are not permanent exhaustion.
- Shared stages start from a seeded seat order and rotate first generation priority
  each stage, including bot seats. Network arrival order is not shared priority.
- Main Deck is the current player-facing replacement for Mono. Preserve legacy
  sheet identifiers and artifacts; this is not a compiler migration.
- Fixing/asset quantities, an expanded staples list and the real cube review are
  deferred to content review. Evolving Wilds is an example for that review, not
  an automatically approved new staple. Review expensive, three-color, game-changer
  and salty cards; increase tribal support. No full-cube tagging or editing now.
- The proposed 36-spell/24-land composition and 8-12 questionnaire/Expedition
  estimate are calibration intent, not fixed production phase counts or a new
  deck-legality gate. GD-400-901 and GD-500-901 remain open for their own scope.

## Boundaries requiring technical attention

### Card primitives versus application shell

BoosterCard.vue is a card wrapper, not an independent selector workflow. Card.vue
uses a global popup emitter; CardImage.vue uses card cache/plugins and may load
external metadata. Audit and isolate these dependencies. New domain/view models
must not depend on the legacy App controller, its game-state enum or DraftState.
Keep canonical card identity separate from rendering-instance identifiers.

Adapt only useful reviewed functionality. Reuse approval does not require dragging
legacy effects, bot-score overlays, wildcard controls or global CSS into new scenes.
Verify that required draft behavior does not require an external source at runtime.

### Phase transitions versus timer pause

Session.pauseDraft stops countdowns; Session.pickCard does not check draftPaused.
The current pause flag is therefore not an authoritative all-player barrier.
Reject picks/grants with stale phase or offer references, account for in-flight
actions and bots, and resume shared generation only after every seat is ready.
Disconnected private choices await recovery; never automatically choose for them.

### Ownership versus browser display

Existing server paths append to pickedCards and emit addCards; the browser event
alone is not an authoritative grant. A future reward adapter must reconcile
Gulchdale ownership, connected/disconnected engine projections, card metadata,
export and reconnect snapshots. Hiding/unmounting a pool must not discard ownership.
Repeated delivery/recovery must not allocate or display another copy.

### Immediate packs versus traditional DraftState

Do not force the new stage loop through a circulating-booster controller or start
another draft that clears pickedCards. Treat shared/private transitions as phases
within one Gulchdale session. Reuse backend capabilities only through narrow
verified adapters; no generic Draftmancer rewrite is authorized.

## Defector mechanic: research only

The owner intends the commander and its tribe to follow a defection and inherit
the destination subtype, aimed at experienced players. Do not implement it now.
Subtype replacement versus addition, existing payoffs, tokens, copies, zones,
mana payment, export and tabletop tracking still require later rule decisions.

A creature costing {1}{G} still requires green mana after becoming a Goblin.
Retaining original color permission and adding the destination color is the
simplest direction to study; it does not produce a genuinely mono-red deck.
Changing casting costs or payment permissions is a more complex separate rule.
No color-permission approach is approved as a playable defection rule yet.

Use reviewed overlays rather than generic text replacement if future research
proceeds. Never change source-card identity or replenish supply through defection.
Defer to advanced-systems research after simulator/vertical-slice evidence.

## Consequences and verification

[The continuation proof](../CONTINUATION_TECHNICAL_PROOF.md) separates Phase 2
domain proof, Phase 3 phase/recovery proof and Phase 4 scene/adapter proof. This ADR
records decisions, not completed technology. Phase 2 remains Building; later phases
remain Not started. Preserve the working legacy application and default runtime.
