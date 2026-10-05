---
name: project-ecosystem
description: Use when this project's development ecosystem needs to be built, repaired or extended — Plane for ticketing, Outline for documentation, and Mailpit as the mail sink — or when the roadmap and the documentation must be republished to them.
---

This project has a **self-contained development ecosystem** under `ecosystem/`.
It is not improvised: the procedure, the traps in both products, and the manual
fallback for every automatable step are written down. Follow them.

1. **Read `ecosystem/README.md` first and follow it in order.** It is written for
   any agent, in any harness, not just this one.
2. **Work only inside this workspace.** Everything the rollout writes lands under
   `ecosystem/.runtime/`; nothing outside this directory is touched, which is why
   the ecosystem can be built with workspace-write access alone.
3. **The three commands are the whole rollout:**
   `make -C ecosystem install` (bring the services up), then
   `make -C ecosystem bootstrap` (workspace, project, API tokens, mail wiring),
   then `make -C ecosystem verify`.
   `verify.sh` is the exit criterion: it fails when the plan, the documents and
   the published copies disagree, naming the file or item at fault.
4. **When a step fails, use the runbook's manual equivalent** rather than
   inventing a workaround. Each one names the file, token or setting to fix, and
   is also how a human would do it in the browser.
5. **Never delete a published document or work item** because it looks stale.
   Report it; removing it is the owner's decision. The syncs report drift and
   never delete.

Hard rules:

- Never stop, prune or reconfigure containers you did not start, and never run
  `docker system prune` or `docker volume prune`.
- Never bind a port that is not in `ecosystem/.runtime/env`; those were probed
  free. `make -C ecosystem health` shows what is held by what.
- Never commit anything under `ecosystem/.runtime/`: it holds generated secrets
  and a live database.
- The plan lives in `docs/roadmap.md` and `docs/extensions.md`. Plane is a
  mirror: change the documents, then re-run the sync.
