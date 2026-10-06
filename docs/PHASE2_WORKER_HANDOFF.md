# Phase 2 independent-worker handoff

Scope: verify GD-300-002, not edit it or implement Phases 3/4.
The tested implementation commit is `3a9e296` on the local
`codex/overhaul-foundation` branch. The documentation checkpoint `db38524` does
not contain simulator implementation. Later evidence-only commits do not change
this source checkpoint.

## Isolate the tested source

The primary worker supplies the exact local commit. Record that hash. Export that
commit with `git archive` into a fresh temporary directory; do not run against the
changing shared checkout or change its branch/index. The archive includes no ignored
runtime secrets. Do not clone upstream history or use ecosystem databases.

Use Node 22 (primary run: 22.22.1). Link the workspace's installed node_modules into
the snapshot without modifying it, or install exact lockfile dependencies in the
isolated snapshot. Compile from that snapshot root:

```sh
phase2_source=/home/captain/Code/Gulchdale
phase2_snapshot="$(mktemp -d /tmp/gulchdale-phase2-worker.XXXXXX)"
git -C "$phase2_source" archive 3a9e296 | tar -x -C "$phase2_snapshot"
ln -s "$phase2_source/node_modules" "$phase2_snapshot/node_modules"
cd "$phase2_snapshot"
npm run build-server
npm run test-simulator
```

All commands below run from the snapshot root. Never compile into the shared
checkout, run formatters, update packages or commit/push fixes. Do not restart
services, run migrations or publish Plane/Outline.

## Run the corpus

Create a dedicated empty report directory with mktemp. The CLI refuses nonempty
directories and never overwrites reports. Redirect stdout/stderr to files outside
that report directory; redirection inside it would make it nonempty before startup.

```sh
phase2_report="$(mktemp -d /tmp/gulchdale-phase2-worker-report.XXXXXX)"
npm run --silent simulate:phase2 -- --runs 5000 --seats both --seed-start 0 --output "$phase2_report" > "${phase2_report}.stdout.json" 2> "${phase2_report}.progress.log"
```

Record the command's exit code immediately. The report directory is printed by
`printf '%s\n' "$phase2_report"`; do not remove it before returning the result.

`--runs` means runs per seat count: this executes 5,000 four-seat and 5,000 eight-seat
scenarios, seeds 0 through 4999 for each. Every passing scenario also executes an
independent command replay. Count 10,000 distinct scenarios, not 20,000 scenarios.
Progress goes to stderr; the final machine-readable summary goes to stdout and
report.json. The runner aborts after 20 failures and returns nonzero rather than
claiming a complete corpus. Preserve partial reports if that happens.

Eight families cover shared packs, partial tribes, replacement rewards,
unfulfillable rewards, temporary contention, deliberate decline, remainder burns
and complete priority rotations. Guided and unguided configurations alternate
across seed blocks. Four-seat fixtures use humans; eight-seat fixtures use five
humans and three simulated bots. Choices are deterministic fixture actions, not
production bot intelligence or evidence of real game balance.

## Explain and replay

```sh
npm run --silent explain:phase2 -- --seats 8 --seed 5
npm run --silent replay:phase2 -- --file /absolute/report-directory/sample-8-decline.json
```

Explain emits the scenario input, attempted commands, snapshot, trace hash,
metrics and full audit including candidate scores, reasons and draws. Replay
validates accepted and rejected commands, final state and trace hash. It refuses
evidence from a different executing compiled engine. Keep matched source/builds.
On failure, reproduce that seed with explain or a one-run simulation into a new
empty directory. The failure file contains the error and available evidence.

## Required report

- Exact source commit, Node/dependency versions, seed ranges, seat counts and exit code.
- report.json with 10,000 passes, 10,000 replay executions, zero failures and aborted=false.
- Per-family counts (625 per family per seat count in the full corpus), representative
  sample traces and exact reproduction commands for any failure.
- Executing engine hash and actual synthetic Pool/Metadata/Rules hashes. These are
  not legacy or promoted application releases.
- Review first-priority counts, shared-stage selection counts/affinity sums,
  options by generation position and distinct outcome signatures. These expose
  potential bias; do not call the real cube balanced because replay passed.

Invariant coverage includes per-card shared/personal capacity, no pool duplicates,
holds before presentation, release/burn accounting, only one decline burn per earned
opportunity, no opponent-owned removal, booster preservation/spending, immutable
opportunity/request identities, wrong-owner and invalid-command rollback, and
pending-offer snapshot recovery.

Return the report and artifact directory to the owner/primary worker. Do not fix
source yourself; rerun against the replacement commit if fixes are requested.
