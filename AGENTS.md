

## Development ecosystem

Ticketing, documentation and a mail sink for this project run from `ecosystem/`:
**Plane** (work items, cycles, releases), **Outline** (engineering documentation,
published from this checkout's tracked markdown) and **Mailpit** (the SMTP sink
both deliver to). They are three Docker Compose projects of their own, separate
from the application's, so nothing here can touch the application's containers,
volumes or ports.

The relationship is **one-way and read-only**. The ecosystem reads
`docs/roadmap.md` and `docs/extensions.md` and the tracked markdown, and publishes
copies into Plane and Outline. Nothing is ever written back into this checkout by
it, and Plane is a mirror: **change the plan in the documents, never in Plane.**

The whole procedure, including the manual fallbacks when an API refuses a step,
is `ecosystem/README.md`. `ecosystem/integrations/verify.sh` is the exit
criterion: it asserts that the plan, the documents and the published copies agree.

**Rules for anything working in this checkout**

- Do not stop, prune or reconfigure this ecosystem's containers. Plane's and
  Outline's datastores look unused whenever the stack is stopped, and
  `docker system prune` destroys them.
- Do not bind the ports in `ecosystem/.runtime/env`; they were chosen because
  they were free.
- `ecosystem/.runtime/` holds generated secrets and a live database. It is
  gitignored and dockerignored; never commit it, and never copy it into an image.
- Never stage everything at once (`git add -A`): stage the paths you changed.
- Deleting published documents or work items is a person's decision. The tooling
  reports drift; it never deletes.
