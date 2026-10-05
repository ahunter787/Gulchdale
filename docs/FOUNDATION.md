# Phase 1: application data foundation

Tickets: GD-100-001–004, GD-200-001, GD-600-001.
Read [database ADR](decisions/ADR-0002-runtime-and-database.md) and
[source/release ADR](decisions/ADR-0004-source-and-release-pipeline.md).
Legacy drafting and file persistence remain unchanged.

## Local operator workflow

The application database is the foundation-profile database service in compose.yml,
with gulchdale-database volume and no published host port. It does not join the ecosystem
network or reuse Plane/Outline storage. The operator wrapper generates a hex password
in ignored .gulchdale/application.env (mode0600), starts only this database, builds
foundation-tools and applies checked-in node-pg-migrate migrations.

```bash
npm run foundation:compose -- init
npm run foundation:compose -- validate
npm run foundation:compose -- import
npm run foundation:compose -- validate <workspace-hash>
npm run foundation:compose -- diff <workspace-hash>
# Review added/removed IDs, component changes, counts and provenance before promotion.
npm run foundation:compose -- promote <workspace-hash> <reviewed-diff-digest>
npm run foundation:compose -- compare
npm run foundation:compose -- catalog <workspace-hash>
npm run foundation:compose -- release <release-hash>
```

init does not import or promote content and does not restart the legacy application.
Repeated imports create no duplicate workspaces/snapshots. migrate is an explicit
up-only operation; do not destroy immutable history through down migrations.
If a DB volume already exists, retain its original credentials; do not replace the
private env file or reset the volume to resolve a connection failure.
The Compose fallback password is development-only, not for deployed installations.

For a separately provisioned application DB, set GULCHDALE_DATABASE_URL in private .env
(or process environment), build-server, run db:migrate, then foundation commands.
Database names must be application-owned gulchdale names. Never point at ecosystem DBs.
Back up the application database and legacy file volume independently.

The initial inspection views are read-only operator CLI catalog/release/compare outputs,
not public admin endpoints or an editor. Browser editing is Phase 6. validate/import/diff
operate on staging; only an explicit reviewed promote moves the foundation live pointer.
This pointer does not select the legacy draft environment.

## Storage and provenance

The schema gulchdale owns:
source_snapshots (exact bytes/hash/provenance), sealed workspaces and workspace_sources;
cards and exact printings; pool_entries and commanders; personal_injections and
supply_policies; archetypes with capacities, tribes, world_tags and sparse card_affinities;
separate human_overrides; immutable component releases and environment_refs;
immutable import_diffs and promotion history; one movable live_release pointer.

Card logical identity is normalized name, independent of set/collector printing identity.
The committed Scryfall cache has partial/minimal records; absent oracle IDs remain absent.
Pool entries retain quantity, sheet membership, tags, source row and exact printing.
Unknown difficulty/world/archetype affinities are not fabricated. Missing affinity is
neutral0.5; human overrides are applied after imported affinities.
Sparse affinity values are [0,1]. Initial tribe definitions come from existing YAML.

Six exact snapshots are retained: Cube Cobra CSV, Scryfall JSON, compiler YAML, static
custom YAML, manifest, compiled legacy environment. The config manifest hash is
SHA-256(main YAML + NUL + static YAML), not a hash of only the main YAML.
Historical unescaped quotes in Cube Cobra Notes are tolerated while exact source bytes
are retained; column counts, required columns, printings and mainboard consistency are
still validated. No refresh edits these snapshots or human overrides.

Initial reconciliation:1114 source rows; sheets144 commander/657 mono/160 land;
66 custom cards,52 draft-effect cards,2 warnings. Static custom objects/support entries
are retained in the catalog rather than incorrectly discarded as ordinary draft cards.
Initial supply is explicitly imported-quantity, not an invented scaling formula.
Archetypes/world tags/personal injections start empty; full-cube tagging is prohibited.

Pool/Metadata/Rules/Engine components have immutable SHA-256 identities. Engine
identity includes the pinned upstream revision, full frozen legacy commit and the
versioned unavailable-player compatibility patch, not just an upstream SHA.
Environment references all four, provenance/counts and workspace identity.
Diffs expose changed values and keyed records as well as component hashes.
Promotion locks against
concurrent pointer/override changes and rejects a stale review. Old releases survive
refreshes and can be inspected without CSV, Scryfall or the Draftmancer parser.
New imports use TypeScript; Python only reproduces the legacy environment.

## Runtime and verification

GULCHDALE_RUNTIME_MODE defaults to legacy. Shadow performs a best-effort database
comparison, never serving new drafts or mutating engine state. Missing/broken DB logs
a sanitized diagnostic and cannot block startup/drafting. Orchestrated is refused before
listeners open until the adapter/vertical-slice acceptance gate is implemented.
No public HTTP/socket changes were made.

```bash
npm run verify:foundation
GULCHDALE_PYTHON=compiler/.venv/bin/python npm run verify:overhaul
```

Foundation DB tests create a dedicated disposable gulchdale_test PostgreSQL container,
publish no ports, apply migrations twice, test invariants, and remove only that container
and its anonymous test volume. They never truncate a development/production database.
Tests prove deterministic offline import, immutable history, human override preservation,
stale-review rejection, read-only catalog access, and shadow isolation.
Phase 2 waits for GD-300-901 supply decisions; no orchestrator/adapter cutover is authorized.
