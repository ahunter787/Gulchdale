# ADR-0003: modular domain, compatibility facade, thin engine

Status: Accepted; frontend and pack ownership amended by [ADR-0009](ADR-0009-new-game-and-integration-boundaries.md). Ticket: GD-000-006.

New domain and repositories live under src/gulchdale/. Existing Draftmancer-derived
files remain the legacy engine; src/Gulchdale.ts stays the compatibility facade.
The TypeScript import service consumes committed CSV, Scryfall JSON, YAML and manifest.
The Python compiler continues reproducing the legacy artifact, never writing PostgreSQL.

Gulchdale owns releases, metadata, scalable supply policies, orchestration, weighting,
telemetry, curation, scene presentation and authoritative player ownership.
Draftmancer-derived transport, pool synchronization and low-level card primitives
are reuse candidates behind adapters; they do not own the new game workflow or UI.
Legacy rendering, passing, reconnects, bots and deck-builder UI remain intact for
legacy mode only. Reviewed card primitives may be adapted into new scenes; legacy
screens/layouts are not design references. New packs resolve immediately, not by passing.
Do not put new Gulchdale game rules into Session.ts or collation.
The one authorized baseline fix is rejecting unavailable pre-draft players before
DraftState construction (no silent bot replacement or redesigned reconnect semantics).

Future adapter operations: enforce phase gates, project offers, grant rewards,
restore projections and bridge complete events. Existing timer pause is not a
server-authoritative barrier. See [technical proof](../CONTINUATION_TECHNICAL_PROOF.md).
No new pack is a circulating booster. No deep engine work
or cube-wide tagging until standalone simulator/orchestrator gates validate boundaries.
