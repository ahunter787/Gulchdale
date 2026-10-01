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

## Development verification

Run the server build, Vue type check, application and compiler tests, production build, and Gulchdale acceptance test. Verify `/` remains disconnected until Host or Join, then test two browsers through `/join/<code>`, six bots, disconnect/reconnect, all four stages, and pool export.
