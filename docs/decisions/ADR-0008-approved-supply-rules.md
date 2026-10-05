# ADR-0008: owner-approved supply rules and bounded Phase 2 start

Status: Accepted for the rules below; remaining decisions are explicitly gated.
Date: 2026-10-05.

## Decision source

The owner answered the six questions directly in
[GD-300-901](http://10.60.0.227:8100/gulchdale/projects/0be43f08-8cb5-4e6d-b6f2-db5223cd1272/issues/36d97f3d-d3f8-483c-8cb2-d92ec0060279).
Plane comment `b845abe2-26b9-4ff9-937b-915c34b8696b`, dated
2026-10-05T20:02:31.443744Z, says the answers were added. The owner then
confirmed in this conversation that work may continue. This record preserves the
answers before updating the published mirror; it does not claim unanswered rules
are approved. Repository Markdown remains authoritative.

## Adopted rules

- Tribal injections: two copies per card for four players, three for eight.
- Commanders and their dedicated support cards are pool- and draft-unique.
- The legacy category called Mono is draft-unique. Main pool is an engineering
  label here, not an approved player-facing rename.
- Tribal pool uses scaled shared session supply. Tribal injections consume it.
- Commander staples currently mean Command Tower and Arcane Signet, one per
  player. Questionnaires and Expeditions grant them; they are not draftable.
- Color-fixing lands use player-specific supply; utility lands are cube- and
  draft-unique.
- Gulchdale assets such as Tribal Boosters and Adornments use player supply;
  availability does not mean every player is automatically granted them.
- A player may never hold duplicates in their drafted pool. Destroy a duplicate
  allocation immediately; never allocate a second copy to that player.
- For a private Expedition reward, only the selected card consumes supply.
  Unselected options are burned as choice objects and released for future supply.
  The more expensive alternative of consuming every offered card is not v1.

Per-player singleton remains settled. Cross-player duplicates are permitted where
the category allows them (tribal and personal staples), not for draft-unique
categories. No legacy compiler, pool artifact, land round or live release changes
follow from this ADR.

## Preserved owner wording and intent

The following excerpts are owner input, not implementer recommendations:

- "Tribal: 2 Copies for 4 players, 3 copies for 8 players for Tribal Injections."
- "Commanders and their package contents must be unique across the draft."
- "Commander Staples (new category since Legacy Gulchdale) are 1 per player.
  Questionaires, Expeditions, etc will grant them these. They are not in draftable pools."
- "However, to reduce the Cube Overall Cost, it must be 1 picked and reserved,
  4 burned, and released back into supply."
- "There should be behaviors for Tribes being exhausted. If 4 players elect
  goblin, that needs to be resolved."
- "No, a player may never hold duplicates in their draft pool. Instantly destroy
  duplicates, never allocate more than 1 copy to a player."
- "Tribal Injections consume shared supply relative to the scale of the draft.
  Personal is a simple check of 0/1 drafted or 1/1 drafted. Commanders and their
  dedicated support cards are Cube and Draft unique."

The owner also noted that a budget mana base probably requires player-specific
fixing that grows through Expeditions, only utility lands being draftable, and a
future refactor of the final land pack. This is future design direction, not
permission to rewrite the working legacy mana-base stage. Completing a tribe
should be difficult; duplicate injections should communicate saturation so players
do not waste Tribal Boosters. No UI or booster-refund policy is approved here.

## Worked examples for the approved prototype

- At four players, Alice and Bob may each receive one copy of the same tribal
  card. A third allocation reports exhaustion; it does not invent a fallback.
- Alice receiving a duplicate consumes no additional shared copy and her pool
  still contains one. This is a duplicate diagnostic, not proof that an entire
  tribe is exhausted: that requires inspecting all eligible tribe candidates.
- Every player can receive one Command Tower from personal supply. It cannot
  appear in a generated draftable Choice Pack.
- Alice choosing one of five private options consumes that selected card only.
  The other four remain available to future choices. An abandoned offer consumes
  no copy in the prototype.
- Two open private offers may contain the same unique card. If one player selects
  it first, the other selection reports unavailable supply. The prototype does
  not auto-resolve that player's choice. Live concurrent presentation/recovery
  still needs an approved contention policy.
- Repeating a successful request with the same identifier and payload returns
  the original result without double-spending. Conflicting reuse is rejected.

## Remaining owner decisions and gates

- What tribal allowances apply at two, three, five, six and seven players?
  The prototype supports the approved four/eight endpoints only; no interpolation.
- What exact response should players see when a tribe runs out: redirection,
  alternative tribe, smaller reward, compensation, or another rule? Exhaustion
  is reported, never automatically resolved until this is approved.
- When are passing-pack cards reserved, and what happens on cancellation, burns
  or recovery? This blocks PassingPack lifecycle work, not the approved allocation
  prototype. No cancellation releases already allocated cards here.
- May concurrent private offers overlap and be regenerated after contention, or
  must temporary presentation holds prevent that? Selected-only consumption is
  approved; live contention handling is not. This blocks multiplayer integration.
- Which fixing lands/assets and quantities belong in the first slice? What is
  the eventual player-facing replacement name for Mono? Neither is guessed here.
- Select the real small curated slice and archetype capacities before claiming
  balance validation. Synthetic accounting tests are not cube tagging or playtests.

## Engineering consequences

Begin Phase 2 with an isolated in-memory supply prototype under `src/gulchdale/`.
Keep immutable release references and canonical card identities. Exclude basics,
fixing lands and assets without approved quantities. Do not infer exception rules
from the later deck-legality gate. No database migration or source promotion is
needed, and imported legacy quantities remain unchanged.

The prototype's shortage result is a safe diagnostic boundary, not an approved
gameplay failure/fallback. No pack scorer, seeded generator, PassingPack adapter,
or complete Phase 2 simulation is delivered by this step. Legacy remains default.
