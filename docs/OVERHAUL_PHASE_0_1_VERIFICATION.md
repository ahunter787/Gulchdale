# Overhaul Phase 0 and Phase 1 exit record

Verification date: 2026-10-05. Executable revision: 6aab9725cd0a3a4a0a7ffc03cd7e43aceed6b0c0.
Subsequent documentation commits do not change the tested runtime.
Branch: codex/overhaul-foundation. Commits and the baseline tag are local, not pushed.

## Preservation

The frozen baseline is e766438c617711a22f3ec6899f4155cb0f6fb040, tagged
gulchdale-legacy-v1.0.0. The cube CSV, Scryfall snapshot, compiler configurations,
compiled legacy artifact and manifest have no changes against that tag.
Generated-data Git attributes and MIT attribution remain intact.

The governing Charter, Systems Map, new roadmap and legacy labels were published
before product implementation. Repository Markdown remains authoritative; mirrors
are updated idempotently and stale published material is never deleted automatically.
The [inventory](architecture/LEGACY_INVENTORY.md), [baseline runbook](LEGACY_BASELINE.md)
and [boundary ADRs](decisions/ADR-0003-domain-and-engine-boundary.md) record the audit.

The isolated pinned upstream archive audit verified revision
11f056cc1be6f99795f89d8dc7111d98f1a83c6a: 1,856 upstream files, 1,821 identical
baseline files, 123 documented differences. No upstream Git history was imported.
The frozen public interface catalog verifies 26 literal HTTP/static registrations
and 106 socket event names. Phase 0/1 introduces no public route or socket changes.

The only legacy engine correction rejects unavailable/stale lobby players before
startDraft mutates seating or generates packs. The missing-Connection crash was
reproduced before this fix; the regression now passes. File persistence is untouched.
Its shallow shutdown serializer is not adopted as an orchestrator checkpoint API.

## Reproducible gates

A clean local clone with no existing node_modules, Python environment, runtime
credentials or ecosystem state was installed using the documented lockfile workflow.
Node22.22.1/npm9.2.0, Python3.14.4, Docker29.1.3 and Compose2.40.3 were used.
These are recorded test versions, not new deployment requirements.

| Gate | Evidence |
| --- | --- |
| Server build | TypeScript build passes |
| Client checks | Type-check and production webpack build pass |
| Compiler | Nine tests; active artifact reproduced byte-for-byte |
| Gulchdale controls/unit | 21 tests; includes deleted-player start regression |
| Legacy acceptance | Eight tests; HTTP host/join, controls, bots, reconnect and golden draft |
| Offline foundation | Five tests; deterministic import, overrides, neutral affinity, mode isolation |
| PostgreSQL foundation | Three integration tests; migrations applied twice on a disposable DB |
| Production image | Composite verify:legacy Docker build passes |
| Shadow outage | Real legacy acceptance passes with an unreachable application DB |
| Production dependency audit | npm audit --omit=dev reports zero vulnerabilities |
| Ecosystem | Ten Modules, 28 work items, exact single-module memberships; 25 Outline documents; zero-change repeat sync |

The clean clone ran both verify:legacy and verify:foundation. A reviewed fixed seed
replays all four rounds, custom rewards, pool integrity, isolated persistence restore
and the real client exporter. Repeated runs match the committed golden fixture:

- Booster hash: a2310b0b5ae38409d3b2352f1d2ddf253c78cfa53082a436e0175c9d40764539.
- Pool hash: df2eb5c5db0f35a9b5add0a893f6dfecb2373fe4e69e649ad49b3ee6ec69c035.

Development/build dependency advisories and webpack bundle warnings are not erased
or represented as a fully hardened image. Existing image dependency minimization and
public deployment controls remain later work. No unrelated upstream formats were repaired.

## Independent data foundation

The separate application-owned PostgreSQL service has its own volume and no host
database port; it does not use Plane or Outline databases. Credentials stay in ignored
mode0600 local configuration. No ecosystem container was restarted or reconfigured.

The TypeScript importer retains six exact source snapshots, normalized catalog/staging
records, and immutable Pool/Metadata/Rules/Engine/Environment releases. Human overrides
are separate from imports. Review digests reject stale promotion, and diffs include
changed values rather than only hashes. Read-only inspection is initially through
operator CLIs, not browser editing or public admin endpoints.

The reviewed [initial release receipt](reference/foundation-initial-release.json)
reproduces from committed inputs and is promoted in the local application database.
Its Environment identity is
18d862d186b05e5f8becdd59a13dfc3d5748ca3a7f9da4429415c2000b8f70b5.
It reconciles with legacy gch-bfc40f9519b9: 1,114 source rows; commander144,
mono657, land160; 66 custom cards, 52 draft-effect cards, two existing warnings.
Pool, Rules, Engine, all source hashes and counts match; metadata differences from
intentional human overrides are reported separately. Source drift with equal counts
is explicitly covered by a regression test.

No draft requires Cube Cobra, Scryfall or EDHREC to load this committed pool.
Legacy remains the default; shadow failure is diagnostic only, and orchestrated mode
is refused. Promotion moves only the foundation pointer, not the legacy draft path.
There was no running application restart or cutover.

## Next gate

Phase 0 and Phase 1 exit criteria are satisfied. Later phases remain Not started.
Phase 2 waits for owner decision GD-300-901, recorded in
[ADR-0007](decisions/ADR-0007-open-game-rules.md): player-count virtual supply,
reservation lifetime, shortages, per-player pool duplicates and injection accounting.
No scaling formula or deck exception was invented. No full-cube tagging, pack
simulator, orchestrator, adapter or four-player overhaul cutover is claimed here.
