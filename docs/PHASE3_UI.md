# Phase 3: Gulchdale UI and environment profiles

The root page is a player-facing Gulchdale landing page. It does not open a Socket.IO connection or create a session. **Host Draft** reserves a server-generated six-character code, while **Join Draft** validates an existing code before navigating to the canonical `/join/<code>` address. Legacy `?session=<code>` links remain accepted and are rewritten to the canonical path after connection.

Unknown invitations never create a session. Codes omit visually ambiguous characters, are case-insensitive at the landing page, and expire if a host reserves one without connecting. A session owner can manage only the draft: seats, bots, readiness, timer, and starting or stopping play. Cube synchronization, compilation, promotion, and restart are operator responsibilities.

## Single active environment profile

The application loads one immutable environment profile at startup. The current profile uses internal ID `classic` and visible name `Gulchdale`. Its manifest supplies stage labels, branding assets, cube identity, version, and hashes to `/api/gulchdale/config` under `environment`.

Every new session records its profile ID and environment version. Persistence also stores the complete environment snapshot, so a restored draft keeps its original cards and rules after a newer build is promoted. Legacy Gulchdale sessions without profile metadata migrate to `classic` without replacing their embedded environment.

To create a future Budget deployment:

1. Copy the reviewed compiler configuration and give its `profile.id` a stable slug such as `budget`.
2. Set its display name, CubeCobra source, stage labels, and branding in YAML.
3. Compile, validate, review, and promote that profile's artifacts using the normal operator workflow.
4. Deploy the resulting artifacts as the single active environment for that server.

Card substitutions are safe when they continue satisfying the selected profile's sheet tags, layouts, exact-printing metadata, and effect references. A list with different sheets or mechanics requires a separate reviewed profile configuration. Loading or selecting several profiles in one server is intentionally deferred to Phase 6.

## Operator freshness checks

The background freshness monitor remains non-blocking. Players and session owners receive no update banner and no compiler controls. Operators use `/api/gulchdale/compiler/status` and logs. Future Forge controls must be authorized by server-issued administrative capabilities; session ownership must never imply them.

## Campfire lobby and player-facing attribution

The lobby uses original Gulchdale artwork: one profile-configured campsite backdrop, standing edge travelers, and six seated travelers oriented toward the fire. Seats 7 and 8 use rear three-quarter views because they sit between the viewer and the fire. The eight seat components own all player-state presentation, so any positional silhouette can later be replaced by a player avatar without changing lobby or session state. Empty, connected, ready, bot, owner, and disconnected seats always include text labels; the artwork is decorative. Reduced-motion clients receive a still scene without drifting embers or glow animation.

The full positioned campfire scene is used on desktop, overlays compact on tablets, and phones use the campsite as a header behind a two-column or one-column seat roster. Invitation, QR, bot, timer, readiness, and start controls remain ordinary accessible controls outside the decorative artwork.

`branding.lobbyBackdrop`, `branding.travelerSilhouettes`, and `branding.seatTravelerSilhouettes` are reviewed compiler-profile fields and are serialized into the active manifest. `branding.seatedTravelerSilhouette` remains a backwards-compatible generic fallback for profiles without a complete positional map. Branding-only recompilation changes the configuration hash, but does not change the card environment bytes or environment version.

Runtime files served from `client/public` use root-relative `/img/...` and `/sound/...` URLs. This is required because the canonical lobby and draft URL is nested beneath `/join/<code>`; relative public URLs would otherwise resolve below `/join/` and return 404.

Player-facing pages use the compact “Gulchdale is Powered by Draftmancer” sponsor link and an **About & legal** popover. It opens on pointer hover or keyboard focus, closes on Escape or when interaction leaves it, and uses a tap/outside-tap fallback on touch-only devices. The popover retains Draftmancer/MIT, Scryfall, and Wizards Fan Content Policy attribution without exposing unrelated communication or donation links in the footer.

## Campfire interaction completion

The first campfire implementation replaced Draftmancer's generic lobby chrome, but it also hid useful controls that already exist in the engine. This is Phase 3 completion work, not Phase 4 mechanics and not Phase 6 Forge administration.

The engine already supports changing a display name, removing connected or disconnected players, transferring ownership, changing seating order, ready checks, bots, timers, and session chat. The Gulchdale lobby currently exposes only invitation sharing, bots, timer, ready check, and draft start. The hidden generic interface must not simply be restored: the campfire needs a small, intentional control surface.

### Player controls

- **Edit display name:** expose from the player's own seat and from a compact `Your traveler` menu. Changing the name must retain the same user ID, seat, owner status, and reconnect identity.
- **Ready response and status:** keep the existing ready-check prompt, show the response on the seat, and let a player revise their answer while a ready check remains active.
- **Copy invitation:** retain the current code, URL, and QR behavior.
- **Leave lobby:** provide an explicit exit to the landing page. Warn only if leaving would abandon session ownership or a reserved draft seat.
- **Connection state:** show reconnecting/disconnected feedback without exposing internal Socket.IO terminology.

Changing a display name should be validated on the server: it must be a string, trimmed, non-empty, and no longer than the supported display limit. The client should receive an acknowledgement and restore the last accepted value after rejection. Duplicate display names need an explicit product decision; rejecting case-insensitive duplicates is recommended because campfire seats otherwise become difficult to distinguish.

### Session-owner controls

The owner may open an accessible action menu from any occupied non-owner seat:

- **Remove from lobby:** confirm using the player's current display name, remove connected players or clear disconnected seat reservations, and free the seat immediately. This is removal, not a ban; someone with the invitation may join again.
- **Transfer ownership:** require a separate confirmation. The current owner cannot remove their own seat and must transfer ownership before leaving without ending the table.
- **Move seat:** optionally expose left/right movement or drag reordering after the basic moderation controls are complete. Seat order affects draft passing, so every client must see the same order and the UI must explain that consequence.

Owner actions should return typed acknowledgements rather than relying only on broadcast state. A non-owner request must continue to be rejected on the server even if a client attempts to emit the event manually.

### Control layout

Do not place permanent buttons over every traveler. Use progressive disclosure:

- selecting or focusing the player's own nameplate opens personal controls;
- the owner receives an action affordance on other occupied seats;
- the existing bottom control bar remains the home for bots, timer, ready check, and start;
- secondary actions such as ownership transfer and seating order live in a `Table controls` drawer;
- compiler, environment promotion, server restart, and other operator capabilities never appear here.

Touch, keyboard, and screen-reader users must be able to open the same menus. Empty seats remain non-interactive. Decorative traveler artwork remains outside the accessibility tree; the nameplate or its button owns the accessible name and state.

### Delivery order

This work should be delivered as **Phase 3.1 — Campfire controls**, before Phase 4 implementation:

1. Add server validation and acknowledgements for display-name and owner moderation events.
2. Add personal controls to the current player's seat.
3. Add owner removal for connected and disconnected players.
4. Add ownership transfer and explicit leave behavior.
5. Add optional seating reordering and compact chat only after the primary controls pass mobile and accessibility review.

### Acceptance coverage

- A player renames themselves and every client updates the same seat without reconnecting or changing identity.
- Invalid or duplicate names are rejected without leaving clients in conflicting states.
- The owner removes an accidentally joined connected player; that client receives a clear message and the seat becomes available.
- The owner clears a disconnected reservation and the occupied-seat count updates everywhere.
- A non-owner cannot remove a player, transfer ownership, reorder seats, or change owner settings.
- Ownership transfer updates all clients before the previous owner can leave.
- Every action is keyboard accessible, usable on a phone, and announced with its result.
- The existing two-browser reconnect and draft acceptance flow remains green.

### Implementation status — 2026-10-03

The Phase 3.1 core is implemented: acknowledged and validated renaming, accessible personal controls, connected-player removal, disconnected-reservation clearing, ownership transfer, explicit leaving, and server-side owner enforcement. Focused socket coverage and the production-engine acceptance path are green, and the rendered desktop Campfire control panel has been visually checked.

Seating reordering and compact chat remain intentionally deferred secondary controls. They should be added only if playtesting shows that the existing draft-order presentation or hidden legacy chat materially harms table operation.

## Development verification

Run the server build, Vue type check, application and compiler tests, production build, and Gulchdale acceptance test. Verify `/` remains disconnected until Host or Join, then test two browsers through `/join/<code>`, six bots, disconnect/reconnect, all four stages, and pool export.
> Legacy/as-built Phase 3 and 3.1: player flow and controls. Not overhaul Phase 3 (orchestrator).
