# Gulchdale research workbench

Tickets: **GD-300-003** implementation; **GD-300-902** owner research.
Status: complete and verified on 2026-10-06. Phase 2 remains Building;
Phases 3/4 remain Not started. This is a headless research tool, not a new game UI.

Reviewed research update: Q01–Q03 are answered; lobby/package direction and R01–R08
follow-ups are in [ADR-0010](decisions/ADR-0010-experience-policy-and-commander-packages.md)
and the questionnaire. The current CLI does not implement mode selection,
commander packages, automatic curation-failure classification or new weighting.
Curve/fixing/spell-count goals are curation observations, not corrective weights.
The handwritten Game Design and Balance collection is protected; engineering
mirrors do not write into it. Current engineering publication has 34 documents;
the 33-document receipts below describe the original workbench delivery.
Further ADR-0010 discussion records sequential recruitment/Expeditions, exclusive
tribe-owned packages and R09–R14 follow-ups. The current CLI cannot simulate that
turn/affiliation/discovery model; existing create/stage commands are not proof of
it. Attack burns and defection are research only, not new supported profile actions.
R15–R17 add public, persistent non-replenishing Expedition stock and a shared
exploration clock, singleton/staple-policy reconciliation and independent Main Deck
opportunity. The current CLI does not implement locations, Explore/Return, final
opportunities, forced skips, public observer projections or catch-up rewards.
Existing traces do not prove these contracts; do not label older simulations as
location-budget tests. Real candidate content remains owner research.

## Purpose and confirmed choices

Research a new candidate collection without inheriting legacy rules, tags or screens.
Legacy is an optional read-only membership reference, never a candidate fallback.
Markdown is for human review; JSON and saved traces are for harnesses.
Only an explicit snapshot command may fetch Scryfall; every analysis runs offline.
Experiments compare random legal selections and affinity-directed selections.
Neither models actual humans or production bot intelligence.

Read the [questionnaire](RESEARCH_QUESTIONNAIRE.md) in Outline and answer Q01–Q12
in **GD-300-902 Plane comments**. We transfer reviewed answers into repository
Markdown only after explicit review. Mirrored Outline-body editing is not the
answer workflow; publication may overwrite it. Comments are not deleted by synchronization.

## Build and storage

Use the repository root, its existing dependencies and Node 22:

```sh
npm run build-server
npm run test-research
```

Inputs and generated output belong in ignored `.gulchdale/research/` or the OS
temporary directory. The CLI requires an empty output subdirectory and refuses
overwrites and symlink output paths. Input files are read-only UTF-8.
No migration, application DB, foundation import or live release is needed.
Small synthetic fixtures live in the tests; do not commit fetched collections,
generated reports, secrets or a full automatically tagged cube.

## Candidate CSV and source snapshot

Minimum CSV column: `name`. Optional columns: `Set`, `Collector Number`,
`oracle_id`, `board`, `maybeboard`. Headers are case-insensitive and ignore spaces,
underscores and hyphens. Cube Cobra exports are accepted without dropping
maybeboard/sideboard research rows. Unknown columns such as legacy tags remain
in the captured CSV but do not create new-game annotations.

An exact printing needs both set and collector number. Missing or contradictory
identifiers are reported, never silently replaced. Same-name printings share the
existing canonical-card identity; printing IDs and source rows remain separate.
CSV copies do not multiply approved virtual supply.
An omitted board defaults to the mainboard label; no board is implicitly excluded.

```sh
npm run research -- snapshot --candidates .gulchdale/research/inputs/candidates.csv --fetch --output .gulchdale/research/snapshot-001
# Offline alternative: a local JSON card array or { "data": [...] } collection response.
npm run research -- snapshot --candidates .gulchdale/research/inputs/candidates.csv --metadata .gulchdale/research/inputs/metadata.json --output .gulchdale/research/snapshot-local
```

Omit both metadata and fetch to capture an unresolved starter collection. Never
combine them. Fetched data is limited to listed identifiers: batches of at most
75, at least 600ms between requests, identifying User-Agent/Accept headers, 20-second
request timeout, at most three attempts and bounded Retry-After handling. A delay
over 60 seconds stops requests for an operator retry later. See Scryfall's
[collection contract](https://scryfall.com/docs/api/cards/collection) and
[API access guidance](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17).

`bundle.json` retains exact CSV and response text, raw UTF-8 SHA-256 hashes,
capture timestamps, source status and resolution errors. A canonical-JSON SHA-256
seal detects edits. New requests create new bundles. Failed runs retain
`failure.json` and available raw responses, never a completed bundle or a replaced
previous snapshot. A sealed research snapshot is not reviewed content approval.

## Separate curator annotations

Pass `--annotations` explicitly. Omitting it means no curator declarations, not
inheritance. YAML requires schemaVersion, an archetype ID list and card annotations.
The following is a template: replace names and hypotheses with reviewed research.

```yaml
schemaVersion: 1
archetypes: [study]
targets:
  fixing: null
  removal: null
cards:
  - name: REPLACE CANDIDATE A
    category: main-pool
    roles: []
    tribes: []
    archetypes: [study]
    affinities: {study: 0.5}
    evidence: Not supplied
    reviewNotes: Research only, not approved content
  - name: REPLACE CANDIDATE B
    category: main-pool
    roles: []
    tribes: []
    archetypes: [study]
```

Use exactly one `name` or canonical `cardId` per annotation. Supply categories are
`commander`, `commander-support`, `main-pool` (public name Main Deck), `utility-land`,
`tribal`, `commander-staple`. Role/group IDs use lowercase kebab case.
Unknown groups/candidates, duplicate annotations, invalid categories and affinity
values outside [0,1] fail validation. Affinities here are human annotations and
take precedence; missing values remain neutral 0.5. Source refresh cannot edit this file.

An explicit empty roles/tribes/archetypes list means assessed with none declared;
an omitted field means unknown. Role targets are collection-level observations,
not minimum player-deck quantities. Missing/null targets show “not specified.”
The supported target roles are fixing, ramp, draw, removal, enabler and payoff.

## Inspection and comparison

```sh
npm run research -- validate --bundle .gulchdale/research/snapshot-001/bundle.json --annotations .gulchdale/research/inputs/annotations.yaml
npm run research -- report --bundle .gulchdale/research/snapshot-001/bundle.json --annotations .gulchdale/research/inputs/annotations.yaml --output .gulchdale/research/report-001
npm run research -- compare --before .gulchdale/research/snapshot-001/bundle.json --after .gulchdale/research/snapshot-002/bundle.json --before-annotations .gulchdale/research/inputs/annotations-before.yaml --after-annotations .gulchdale/research/inputs/annotations-after.yaml --output .gulchdale/research/comparison-001
```

Add `--legacy-reference` only to `report` when explicitly wanting legacy membership
overlap. It reads committed legacy evidence without importing its metadata, tags,
effects or pack rules. The foundation importer and Phase 2 proof commands are unchanged.

Reports include logical/source-row counts, boards, official mana-value curves,
color identity, observed type lines and produced-mana fields, declared roles,
tribes/archetypes, category capacities and data-quality issues. Every coverage
metric includes total, known and unknown. Colorless/known empty fields differ
from missing metadata. Printed creature types do not automatically become curated
support tags; conditional mana production is not a claim of reliable fixing.
Diffs separate metadata/row changes from human-annotation changes.

`validate` confirms structure and snapshot hashes. A collection may be valid for
inspection while unresolved/unclassified cards still prevent experiments.
No automatic power, salt, difficulty, price or affinity rating is performed.

## Explicit experimental profiles

Profiles are versioned YAML, not production settings. All initial resources,
scoring parameters, permission masks and actions must be provided. This small
four-seat private-offer template demonstrates syntax only, not playable pacing:

```yaml
schemaVersion: 1
name: research-hypothesis-only
cards: [REPLACE CANDIDATE A, REPLACE CANDIDATE B]
seedStart: 0
runs: 10
settings: {guidance: 0, baseWeight: 1}
rosters:
  - players:
      - {id: p0, kind: human, boosters: 0}
      - {id: p1, kind: human, boosters: 0}
      - {id: p2, kind: human, boosters: 0}
      - {id: p3, kind: human, boosters: 0}
    actions:
      - type: create
        requestId: offer-1
        opportunityId: reward-1
        playerId: p0
        definition:
          kind: private
          options: 2
          keep: 1
          categories: [main-pool]
          fallbackCategories: []
          allowedColors: [W, U, B, R, G]
          signals: {study: 1}
          tribe: null
          remainder: release
          boosterCost: 0
      - {type: recover, requestId: recover-1}
      - {type: select, requestId: select-1, opportunityId: reward-1, playerId: p0}
```

Cards may be exact candidate names or canonical IDs; the subset must be unique.
Each included card needs an unambiguous identity, Oracle ID, color identity,
declared supply category and explicit tribes/archetypes lists. Roles and human
affinities may remain unknown. Only color-identity metadata is used as the
simulator's color mask; no commander/Adornment legality is invented.

Supply is the approved policy: draft-unique categories cap one, tribal two/four-seat
or three/eight-seat, personal staples one per player and grant-only. Exactly four
or eight explicit player/bot seats are supported, with at most one roster per count.
Both modeled policies always run. `runs` is per roster **and policy**: two rosters
with runs=10 execute 40 distinct experiments plus their independent command replays.

Actions reuse engine command fields with explicit request/opportunity identities:
`create`, `stage`, `select`, `decline`, `grant`; `recover` restores a snapshot.
Stage definitions must be shared, start at stage 0 and use engine offers named
`stage:<index>:<playerId>`. Select chooses the configured keep count under each
policy; decline burns one policy-chosen held copy unless an explicit cardId is
given. Grant requires cardId/name. Remainder burns occur only when the profile
declares `remainder: burn`. No grants, retries, rerolls or declines are invented.
An explicit retry reuses the opportunity but uses a new request identity.
Shared offers must use a stage action to preserve seeded rotating priority.
A stage currently uses one explicit definition for every seat; individual masks
and signals are available in private offers, not inferred leader permissions.

```sh
npm run research -- simulate --bundle .gulchdale/research/snapshot-001/bundle.json --annotations .gulchdale/research/inputs/annotations.yaml --profile .gulchdale/research/inputs/experiment.yaml --output .gulchdale/research/experiment-001
npm run research -- replay --file .gulchdale/research/experiment-001/sample-4-random-legal.json
```

Random selection uses a separate seeded stream. Directed selection maximizes the
normalized signal/affinity contribution; equal scores use canonical ID order.
Initial pack seeds match between policies. Later ownership and offers may diverge.
Narrowing runs/seedStart preserves a given seed's generation stream for reproduction.

Results record actual snapshot/annotation/profile/executing-engine identities,
Node/dependency provenance, seeds, both policies and per-seat outcomes. Each case
reports shortages, temporary contention, smaller offers, replacements, declines,
burns, allocations, remaining boosters and affinity diagnostics. These are bounded
model observations—not a deck-buildability or real-human-quality prediction.
A passing case means accounting/replay checks completed, not that every requested
reward was fulfillable or the resulting deck would be good. Markdown summarizes
the policy comparison; full per-seed/per-seat JSON remains on disk. CLI output is
intentionally short to avoid flooding harness context.

The first full trace per roster/policy is saved. Failures retain partial evidence
and the rejected action; replay accepts either a sample or failure wrapper and
rejects engine/state/result drift. Twenty failures abort a run with a nonzero exit;
an incomplete corpus is never labeled passing. Saved artifacts cannot replay under
a different compiled research engine; retain the matching source/build.
Evidence also has a canonical JSON seal, including its metrics and provenance.
Node/dependency versions are part of the research engine identity.
Saved samples include full candidate eligibility, weight contributions, draws and
offer explanations from the existing engine audit, plus actual immutable
Pool/Metadata/Rules/Engine references. These references are research-only, not
promoted application releases. The engine manifest exposes its runtime,
dependency versions and compiled-source hashes for inspection.

## Verification and remaining gates

The production dependency audit discovered inherited `source-map-js@1.2.1`
([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)).
The owner approved a narrowly scoped update to `1.2.2` on 2026-10-06.
Only that transitive package's lock entry changed; no broader dependency upgrades
or legacy source changes were made. `npm audit --omit=dev --audit-level=high`
then passed with zero reported vulnerabilities. This is an audit result, not a
claim that every application vulnerability has been ruled out.
The Docker builder's full install still reports development-tool dependency
findings; the production-only audit is a distinct gate. Those broader upgrades
are not part of the approved one-package patch and remain separate hardening work.

Verification receipt (2026-10-06, Node 22.22.1):

- `npm run test-research`: 38 passing, including mocked fetching and offline CLI/replay.
- `GULCHDALE_PYTHON=compiler/.venv/bin/python DOCKER_BUILDKIT=0 npm run verify:overhaul`: passed after the dependency patch. Server/client builds and type-check passed; compiler 9, controls 21, acceptance 8, foundation 5, supply 9, simulator 34, research 38 and PostgreSQL integration 3 tests passed.
- Production Docker image built successfully; no service restart or runtime cutover occurred.
- Production-only audit: zero vulnerabilities. Full development-inclusive audit: 18 existing findings (1 low, 3 moderate, 12 high, 2 critical), not resolved by this scoped patch.
- Ecosystem verification passed with exact module membership and ten modules, 34 work items, 33 Outline documents. Outline-before-Plane publication of the completion labels passed; the second pass produced zero changes.
- Legacy tags still resolve to `e766438c617711a22f3ec6899f4155cb0f6fb040` and `e3d8a9f87617aa057bd2a995ec6f56a65c2eec11`. Legacy engine/client/compiler/data inputs, importer, supply engine and simulator are unchanged.

These tests use small synthetic candidates. No real candidate collection,
archetype targets, content balance or player behavior has been approved.

Run research tests, existing legacy/foundation/compiler/client/Docker gates and
`make -C ecosystem verify`. API tests are mocked and require no live external services.
The questionnaire and guide publish to Outline before Plane; repeat publication
must make zero changes. Current totals after ADR-0010: ten modules, 34 work items,
34 engineering Outline documents. The original 33-document delivery receipt remains historical.

GD-300-003 completes only when implementation and gates pass. GD-300-902 stays open
until owner research is reviewed. No full-cube tagging, database/live pointer write,
legacy UI inheritance, Expedition implementation, new Defector rules or cutover
is included. [Phase 2](OVERHAUL_PHASE_2.md) remains Building for real content and balance;
[orchestrator/scene proofs](CONTINUATION_TECHNICAL_PROOF.md) remain separate gates.
