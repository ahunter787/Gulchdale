# ADR-0005: preservation and cutover gates

Status: Accepted. Ticket: GD-000-007.

Baseline commit e766438 is tagged gulchdale-legacy-v1.0.0. Preserve its compiled
environment and input hashes. Verify the pinned upstream source via isolated archive,
never merge upstream ancestry. Record hashes and changed paths in a patch manifest.
Broad dependency findings are not authorization to repair all inherited Draftmancer code.

Every phase keeps legacy tests, compiler reproduction, client checks/build and production
image green. Documentation and backlog synchronization must verify without mutations.
The first four-player slice must be demonstrably preferable before replacing legacy.
Legacy default persists through Phase 4 and until that gate; orchestrated remains refused.
Earlier rollback needs only legacy mode; later also restore the previous release pointer.
Unresolved owner rules halt relevant implementation, not the entire preservation effort.
