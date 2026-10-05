# ADR-0001: The development ecosystem lives in this repository, under `ecosystem/`

- **Status:** accepted (created by the scaffold; replace the details with your own)
- **Date:** created when this project was scaffolded

## Context

Building a project needs three things around the code: somewhere to track what is
being built and when (tickets), somewhere to write down how it works and why
(documents), and something to catch the mail the software sends in development
before a real mail server exists.

Two shapes were possible. A shared service on the machine, used by every project;
or one ecosystem per project, living inside the project's own workspace.

The deciding constraint is that the agents building this project are confined to
the project's workspace: they may create and change files inside it and nowhere
else. Anything they must drive has to be inside it. A shared service would need
its configuration, tokens and state to live outside the workspace, which puts the
whole rollout out of reach of the worker that is supposed to perform it.

## Decision

The ecosystem is **per project and self-contained inside it**:

- `ecosystem/` holds Plane, Outline and Mailpit as three Docker Compose projects,
  their install scripts, the two syncs, and the runbook.
- Everything the rollout generates - the env file, service secrets, API tokens,
  sync state, backups and Plane's vendored bundle - lives under
  `ecosystem/.runtime/`, which `.gitignore` and `.dockerignore` both exclude.
- The ecosystem only ever **reads** the checkout (tracked markdown,
  `docs/roadmap.md`, `docs/extensions.md`) and publishes copies into Plane and
  Outline. It never writes back, and Plane is a mirror of the documents.
- Ports are **probed**, not chosen from a table, because other projects and other
  services already hold ports on a working machine.

## Consequences

**Good.** A project's ecosystem is isolated: its own ports, its own data, its own
lifecycle, and no way for one project's mistake to reach another's. Onboarding is
one scaffold command. Docker shares images between projects, so a second ecosystem
costs containers and volumes rather than repeated downloads. And the worker that
builds it needs no access beyond its own workspace.

**Costs, accepted.** One stack per project: roughly two dozen containers while it
is running, and a few hundred megabytes of data once Plane and Outline have
written anything. Ports have to be probed rather than assumed. And the
application's repository carries a tooling directory - kept out of images,
excluded from the published documentation, and ignored at runtime.

**This decision created one rule worth repeating:** the ecosystem's runtime is
generated, ignored and never committed, and the plan lives in the project's
documents rather than in Plane.
