# Phase 2: Gulchdale compiler

The compiler turns the public Gulchdale CubeCobra CSV and reviewed YAML rules into a deterministic Draftmancer environment. Network access is only required by `sync`, `build`, and the remote `status` check. Drafting always uses the committed active environment and remains available offline.

## Safety model

- `data/cubes/gulchdale.txt` is the active environment.
- `data/cubes/gulchdale.manifest.json` records its provenance and `gch-<12 hex>` version.
- `data/compiler/source/gulchdale.csv` and `scryfall.json` are the active reproducible inputs.
- Candidates live under ignored `.gulchdale/build/<version>/` directories.
- `compile`, `validate`, `build`, `diff`, and `status` never change active files.
- `promote --version` recompiles and validates the exact candidate, then replaces all four active artifacts with rollback protection. It does not commit, restart, or hot-swap running sessions.

The application reads and hashes the active environment once at startup. It refuses to start if the environment and manifest hashes disagree. Existing sessions therefore stay on the environment loaded by their process until an operator restarts or rebuilds the application.

## Docker workflow

No host Python installation is needed:

```bash
# Download CubeCobra, fill the Scryfall cache, compile, and validate a candidate.
docker compose --profile tools run --rm compiler build

# Review the source, sheet, custom-card, effect, hash, and warning changes.
docker compose --profile tools run --rm compiler diff --version gch-0123456789ab

# Optionally save the same semantic review as Markdown.
docker compose --profile tools run --rm compiler diff --version gch-0123456789ab \
  --format markdown --output .gulchdale/build/gch-0123456789ab/promotion-report.md

# Revalidate and promote exactly the reviewed candidate.
docker compose --profile tools run --rm compiler promote --version gch-0123456789ab

# Review the four active artifacts, activate them deliberately, and verify the
# version loaded by the new container before committing.
git diff -- data/cubes data/compiler/source
docker compose up --build -d gulchdale
curl --fail --silent http://127.0.0.1:${GULCHDALE_PORT:-43721}/healthz
curl --fail --silent http://127.0.0.1:${GULCHDALE_PORT:-43721}/api/gulchdale/compiler/status
```

`restart` alone does not activate a promotion because the environment is copied into the production image. Use `up --build -d` as shown above. Set `GULCHDALE_UID` and `GULCHDALE_GID` if the host checkout is not owned by UID/GID 1000. Promotion should be followed by a normal Git review and commit; the compiler never invokes Git.

## Promotion checklist

1. Run `build` and note the exact `gch-...` candidate version it prints.
2. Run `validate --version <version>` and `diff --version <version>`.
3. Review all additions, removals, sheet movements, effect changes, and warnings. Warnings are non-blocking but should be understood.
4. Run `promote --version <version>`. Promotion revalidates the candidate and atomically replaces the active CSV, normalized metadata, environment, and manifest.
5. Review `git diff -- data/cubes data/compiler/source` and run the test suites appropriate to the change.
6. Run `docker compose up --build -d gulchdale` to build an image containing the promoted artifacts.
7. Check Compose health plus `/healthz`, `/api/gulchdale/compiler/status`, and `/api/gulchdale/config`. All three APIs must report the promoted version and environment hash; the compiler state should settle on `current` when CubeCobra is reachable.
8. Commit the Phase 2 source and all four promoted active artifacts together. Push only after the live verification succeeds.

## Human-readable review surfaces

The formats have deliberately separate jobs:

- `compiler/config/*.yml` is the reviewed, human-maintained rule source.
- `data/compiler/source/gulchdale.csv` is the exact CubeCobra source snapshot.
- `data/cubes/gulchdale.manifest.json` is the machine-readable provenance record and is pretty-printed for inspection.
- `data/cubes/gulchdale.txt` is deterministic generated Draftmancer input and should not be edited by hand.
- `diff` is the human-readable explanation of the change between a candidate and the active version. It emits JSON by default and supports `--format markdown`, optionally with `--output <path>`.

Generated Markdown promotion reports contain the version, hashes, counts, warnings, and the same semantic diff. Candidate reports remain ignored with their candidate directory; a reviewed report can be copied into release notes when useful. This is preferable to maintaining a second YAML or TOML manifest, which would duplicate authoritative data and could drift. Static custom cards use conventional block-style YAML so cards and nested effects remain practical to review by hand.

## Local Python workflow

Python 3.12 is the supported compiler runtime:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -e './compiler[dev]'
npm run build-server

.venv/bin/gulchdale-compiler sync
.venv/bin/gulchdale-compiler compile
.venv/bin/gulchdale-compiler validate --version gch-0123456789ab
.venv/bin/gulchdale-compiler diff --version gch-0123456789ab
.venv/bin/gulchdale-compiler status
.venv/bin/gulchdale-compiler promote --version gch-0123456789ab
```

`build` is the normal shortcut for `sync`, `compile`, and authoritative Draftmancer validation. `status` downloads the CSV into the ignored workspace only long enough to compare its hash. Use `status --offline` to print active provenance without making a network request.

## Reviewed rules and validation

`compiler/config/gulchdale.yml` owns sheet tags, the note grammar, four layouts, two-pick settings, and tribal definitions. `compiler/config/static_custom_cards.yml` owns custom-card text, images, adornments, partner objects, and booster objects. CSV rows marked as maybeboard or any non-mainboard board are excluded everywhere; conflicting board fields are errors.

The compiler rejects missing columns, unknown tags, malformed notes, ambiguous or unresolved references, duplicate custom cards, invalid images/effect counts/layouts, undersized sheets, incomplete or mismatched exact-printing metadata, and Draftmancer parser failures. Unused support cards and recognized but unreferenced custom objects are recorded as warnings in the manifest and diff.

The frozen Phase 1 fixture must always reproduce SHA-256 `faa043e37114b395869ef7a2d426167e632f3e3f471370f957d1c17cf9523fac` byte-for-byte.

## Freshness monitor

Shortly after startup and every six hours, the server compares the remote CSV hash to the active source hash. Set `GULCHDALE_UPDATE_CHECK_INTERVAL_SECONDS=0` to disable it or provide another non-negative interval. Each request has a ten-second timeout and never affects `/healthz` or drafting.

- `GET /api/gulchdale/compiler/status` returns the active version/hashes, update state, and last successful check.
- `GET /api/gulchdale/config` includes the same state for compatibility and operator diagnostics.
- Freshness is not a session-owner responsibility. Phase 3 removes player-facing notices; operators inspect the endpoint or server logs until authenticated administration arrives with Forge in Phase 6.

## Troubleshooting

- **Draftmancer validator is not built:** run `npm run build-server` before local `validate`, `build`, or `promote`.
- **CubeCobra or Scryfall is unavailable:** keep drafting from the active bundle and rerun `build` later. No active file was changed.
- **Candidate inputs were edited:** rerun `compile`; promotion intentionally rejects a manifest/input/output mismatch.
- **Application refuses to start after a manual edit:** restore all four active artifacts together or promote a validated candidate. Do not edit `gulchdale.txt` by hand.
- **Status remains stale after promotion:** restart or rebuild the application so it loads the new manifest and environment.
