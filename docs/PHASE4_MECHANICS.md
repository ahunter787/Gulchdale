# Phase 4: mechanics presentation and singleton allocation

Phase 4 gives Gulchdale's custom mechanics first-class feedback while preserving the pinned Draftmancer engine. Its first design constraint is that supplemental `AddCards` effects currently violate a cube-wide singleton guarantee.

## Confirmed current behavior

Draftmancer's `AddCards` implementation creates new card instances when an effect resolves. `duplicateProtection` prevents repeats only inside that one effect resolution. It does not reserve a card across players, earlier effects, bots, or the rest of the session.

This is safe for effects that add one uniquely referenced partner from a support-only card, but tribal packs share candidate pools. Two players can therefore receive the same tribal card. Pick order currently determines nothing about availability because the candidate pool is effectively refilled for every trigger.

Current tribal capacity is:

| Tribe | Unique candidates | Trigger cards | Maximum requested if all triggers appear |
| --- | ---: | ---: | ---: |
| Elf | 20 | 6 | 33 |
| Goblin | 20 | 4 | 24 |
| Zombie | 19 | 5 | 30 |
| Faerie | 30 | 6 | 36 |
| Human | 20 | 8 | 48 |

The current content cannot guarantee both the printed award counts and cube-wide singleton. This is a data-capacity conflict even if the engine tracks claims perfectly.

## Singleton contract

The recommended Gulchdale rule is:

> A card name may enter at most one player's drafted pool during a draft, whether it came from a normal pack, a partner effect, or a tribal/custom booster.

Identity should be based on normalized card name rather than printing ID. Custom rule objects such as `Partner Wanted` remain distinct cards by their configured name.

Supplemental candidates must remain outside normal sheets. The compiler should reject a card that can both appear in an ordinary booster and be allocated by a singleton supplemental effect unless the profile explicitly defines an exception.

## Recommended implementation boundary

Implement this as an additive Gulchdale capability rather than a rewrite of generic collation:

1. Extend compiler-owned `AddCards` data with explicit metadata:
   - presentation kind (`partner`, `tribal_booster`, or `custom`);
   - visible label;
   - allocation pool ID when cards are selected from a shared pool;
   - singleton scope (`draft`).
2. Validate every named pool, cross-pool overlap, ordinary-sheet overlap, and worst-case capacity during compilation.
3. After the normal boosters are generated but before `DraftState` starts, preallocate supplemental cards to every effect-bearing card instance present in those boosters.
4. Randomize allocation within each pool, but make it independent of player pick order. Store the allocated card IDs on the unique trigger-card instance or in plain persisted draft state so reconnects and restarts cannot reroll the result.
5. Resolve the existing `AddCards` operation from that preallocation. The generic Draftmancer behavior remains the fallback for environments without the new metadata.
6. Emit a structured `gulchdaleEffectResolved` event containing the trigger, presentation kind, label, awarded cards, and allocation status. Retain the existing pool mutation and draft log behavior.

This touches the compiler schema, one pre-draft allocation step, the existing `AddCards` resolution branch, persistence coverage, and the Gulchdale client. It does not require changes to pack passing, bots, reconnects, or generic Draftmancer collation.

## Capacity decision required

Before enabling draft-wide singleton allocation, choose one of these content policies:

1. **Guarantee full awards (recommended):** expand each tribal pool or reduce/remove trigger counts until compiler validation proves worst-case capacity. Runtime never grants a short pack.
2. **Finite shared reserve:** preserve current pools and allow later triggers to grant fewer cards. This is mechanically clean but creates a hidden scarcity and pick-order fairness problem unless all awards are preallocated and shortages are clearly presented.
3. **Explicit exception:** document spawned tribal cards as outside cube-wide singleton. This requires no engine work, but accepts the duplicate behavior found in playtesting.

Do not silently fall back to duplicates when a pool is exhausted. That would make the rule unreliable and difficult to test.

## Player experience

### Partner acquisition

- Show a compact `Partner Found` reveal after the pick is committed.
- Display the triggering card and acquired partner together.
- State that the partner was added directly to the player's pool.
- Move focus to the reveal for keyboard users and provide a reduced-motion transition.

### Tribal/custom booster

- Show `Booster Unlocked` with the tribe or configured effect label.
- Reveal the awarded cards as a supplemental mini-pack, then add them to the pool automatically.
- Explain that these cards were granted rather than picked from the circulating pack.
- If the chosen capacity policy permits a short award, state the requested and awarded counts explicitly.

The toast currently used for `addCards` can remain as a fallback, but it is not the primary Phase 4 presentation.

## Delivery slices

### 4A — semantics and regression fixtures

- Decide the capacity policy and cube-wide singleton definition.
- Add compiler fixtures for pool capacity, pool overlap, sheet overlap, partner references, and deterministic metadata output.
- Add a failing engine test that reproduces two players receiving the same supplemental card.

### 4B — allocator

- Add pre-draft allocation for the active Gulchdale profile.
- Cover humans, bots, disconnect/reconnect, persistence restore, and multiple effects from the same pool.
- Confirm allocation does not mutate shared card definitions.

### 4C — structured effect events

- Add typed server/client event data.
- Preserve pool state and draft logs before presenting the event.
- Provide the generic toast fallback for old profiles and unknown effect kinds.

### 4D — Gulchdale presentation

- Implement Partner Found and Booster Unlocked reveals.
- Verify desktop, mobile, keyboard, screen-reader labels, and reduced motion.
- Avoid blocking pack passing; the reveal may be dismissed after the server has committed the pick.

### 4E — acceptance

- Run an eight-seat, four-stage draft containing at least two effects from one tribal pool.
- Assert no normalized card name appears in more than one final pool.
- Assert partner and tribal awards survive reconnect and server-state restoration.
- Assert the triggering player receives exactly one structured presentation event.
- Verify final pool and deck export include the awarded cards.

## Out of scope

- Campfire username, removal, ownership, seating, and generic lobby controls, which are Phase 3.1 completion work.
- Generalizing the allocator for every Draftmancer cube.
- Updating to current Draftmancer upstream.
- Rewriting generic booster generation or bot logic.
- Commander selection and color-identity enforcement, which remain Phase 5.
- Forge administration and multi-profile selection, which remain Phase 6.
