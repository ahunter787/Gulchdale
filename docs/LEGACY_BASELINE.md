# Legacy baseline reproduction and verification

Ticket: GD-000-003 / GD-000-004 / GD-000-005 / GD-000-007.
Frozen source: e766438, tag gulchdale-legacy-v1.0.0. Legacy artifact and hashes are
listed in [inventory](architecture/LEGACY_INVENTORY.md); input bytes are unchanged.

## Fresh clone

Prerequisites: Git, Node22/npm, Python>=3.12 with venv/pip, Docker Compose.
Clone the Gulchdale repository and check out the implementation branch. No upstream
checkout, external cube login, source download, account or ecosystem secret is required
to build/run the legacy application.

```bash
npm ci
python3 -m venv compiler/.venv
compiler/.venv/bin/python -m pip install -r compiler/requirements.lock
compiler/.venv/bin/python -m pip install -e './compiler[dev]'
GULCHDALE_PYTHON=compiler/.venv/bin/python npm run verify:legacy
docker compose up --build -d gulchdale
```

Open localhost:43721 (or configured GULCHDALE_PORT). Host a lobby; share the six-character
invite after the host has joined. Choose names, ready players, remove accidental or
disconnected seats, then start. Locked rules cannot be overwritten by a player.
Legacy file persistence uses gulchdale-state; this command does not start PostgreSQL.
For host-only development, npm run dev watches server/client; use its port3000.

The composite verify:legacy command builds the server, checks/builds the client, runs
compiler tests including exact active reproduction, Gulchdale unit/control tests,
engine acceptance, offline foundation tests and a production image build.
It changes no live release, compiled cube artifact or running service.
Full phase verification additionally runs verify:foundation and ecosystem verify.
A fresh clone needs ecosystem installation/bootstrap only to publish mirrors, not draft.

## Golden acceptance

test/gulchdaleGolden.ts hosts over HTTP, validates invitation lookup, connects eight
socket players, exercises name/authorization controls, runs all 40 two-card pick waves
over four rounds, prioritizes existing custom effects, validates awarded cards/pool
counts/unique instance IDs, checks isolated persistence restore and executes the actual
client MTGA exporter. Seed20261005 fingerprints are reviewed in
test/data/gulchdale-golden.json and never automatically regenerated.

test/gulchdaleAcceptance.ts separately runs two humans/six bots and both lobby and
in-draft disconnect/reconnect. It verifies already-drafted pools and draft positions
never regress. Together they cover deterministic collation, multiplayer lifecycle and
the timing-dependent legacy bot behavior without pretending bot timing is seeded.

The stale-player regression first reproduced TypeError in DraftState construction.
Session.startDraft now rejects disconnected/stale lobby players before seating,
generation or pool mutation. The owner must wait for reconnect or clear the reservation.
Existing removal/reconnect behavior and custom effects are unchanged.

The legacy shutdown serializer is tested against an isolated session view, because it
uses shallow player copies while serializing bot instances. It is not a safe live
checkpoint API; do not use it as one in the new orchestrator. File persistence remains
untouched. This limitation is preserved and recorded, not broadened into a rewrite.

## Upstream audit and triage

npm run verify:upstream downloads only the pinned codeload archive into a fresh temporary
directory and compares it with the frozen tag. It imports no Git ancestry.
The generated [manifest](reference/legacy-upstream-patches.json) records exact archive
hash and every changed/added/removed path. It is a baseline audit, not a patch installer.
Post-baseline changes are documented in UPSTREAM.md.

Development dependency advisories, inherited unused formats and webpack size warnings
are triaged separately from production reachability. Do not run audit fix --force,
merge upstream branches, or repair every inherited test to clear a warning.
Production dependency auditing remains a CI gate. Docker build may report build-only
advisories because the existing image retains builder dependencies; image minimization
is deployment-hardening work, not an excuse to relabel those dependencies production-safe.
