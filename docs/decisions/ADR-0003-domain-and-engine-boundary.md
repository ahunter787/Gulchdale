# ADR-0003: modular domain, compatibility facade, thin engine

Status: Accepted. Ticket: GD-000-006.

New domain and repositories live under src/gulchdale/. Existing Draftmancer-derived
files remain the legacy engine; src/Gulchdale.ts stays the compatibility facade.
The TypeScript import service consumes committed CSV, Scryfall JSON, YAML and manifest.
The Python compiler continues reproducing the legacy artifact, never writing PostgreSQL.

Gulchdale owns releases, metadata, scalable supply policies, orchestration, weighting,
telemetry and curation. Draftmancer owns rendering, sockets, passing, reconnects, bots
and deck-builder UI. Its existing legacy custom effects stay intact pending an adapter.
Do not put new Gulchdale game rules into Session.ts or collation.
The one authorized baseline fix is rejecting unavailable pre-draft players before
DraftState construction (no silent bot replacement or redesigned reconnect semantics).

Future adapter operations: pause, resume, inject passing pack, grant private reward,
bridge complete events. ChoicePack is not a circulating booster. No deep engine work
or cube-wide tagging until standalone simulator/orchestrator gates validate boundaries.
