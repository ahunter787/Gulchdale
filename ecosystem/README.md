# This project's development ecosystem

Plane for ticketing, Outline for documentation, Mailpit as the mail sink — one
self-contained stack per project, living in this directory.

| Service | What it is for | Reached at |
| --- | --- | --- |
| **Plane** | Work items, cycles, modules, releases: what is being built, and when | `ECOSYSTEM_HOST:PLANE_HTTP_PORT` from `.runtime/env` |
| **Outline** | Engineering documentation, published from this checkout's tracked markdown | `ECOSYSTEM_HOST:OUTLINE_HTTP_PORT` |
| **Mailpit** | The SMTP sink both deliver to, with a web inbox | `ECOSYSTEM_HOST:MAILPIT_HTTP_PORT` |

The exact URLs are printed by `make health` and recorded in `.runtime/env`.

## What this is, and is not

- **Not part of the application.** Three Docker Compose projects of its own
  (`<slug>-infra`, `<slug>-outline`, and Plane's own bundle project), with their
  own network, volumes and ports. `make down` here cannot touch the
  application's containers.
- **Read-only with respect to this checkout.** It reads the tracked markdown,
  `docs/roadmap.md` and `docs/extensions.md`; it publishes copies into Plane and
  Outline; it never writes back. **Change the plan in the documents, never in
  Plane** — Plane is a mirror.
- **Self-contained.** Everything it generates lives under `.runtime/`, which
  `.gitignore` and `.dockerignore` both exclude. Nothing outside this directory is
  written, which is why a worker confined to the project workspace can run the
  whole rollout.
- **Not exposed to the internet.** Plain HTTP on the LAN, until you give it a
  real hostname (see *Pointing this at a real hostname*).

## Quick start

```bash
make env        # choose this machine's address and a free block of ports
make install    # fetch and start Mailpit, Outline and Plane
make bootstrap  # workspace, project, API tokens, mail wiring, first sync
make verify     # assert the plan, the documents and the published copies agree
```

`make install` pulls several images and starts about two dozen containers. The
first run also applies Plane's migrations — several hundred of them, **one at a
time, on a single core** — so the API can be twenty minutes or more behind the web
page on a busy machine. `make install` returns when the page answers; `make bootstrap` waits for the
API itself and says how long it has been waiting. Nothing is broken while that
happens; it is worth watching once:

```bash
docker logs -f $(docker ps --filter label=com.docker.compose.project=$(grep '^PLANE_COMPOSE_PROJECT=' .runtime/env | cut -d= -f2)- --format '{{.Names}}' | grep migrator | head -1)
```

`make bootstrap` is the part that would otherwise be done by clicking in two
browsers. It is idempotent, so re-running it is safe.

## What each step does

**`make env`** writes `.runtime/env`. It takes this machine's LAN address so that
sign-in links and magic links work from a browser, and it **probes** for a free
block of eight consecutive ports — nothing is assumed, because other projects and
other services are already holding ports on a working machine. It never
overwrites an existing `.runtime/env`.

**`make install`** brings up the three services:

1. Mailpit, the sink both other services deliver to.
2. Outline, with its own PostgreSQL and Redis. Its env file is generated under
   `.runtime/`, secrets included.
3. Plane: the pinned config bundle is downloaded from Plane's own setup endpoint,
   the settings we change are applied, every secret Plane ships a placeholder for
   is replaced with a locally generated one, the connection strings that embed
   those passwords are rebuilt, and the stack is started.

Secrets are generated **once** and then kept: rotating them would invalidate
sessions and encrypted values.

**`make bootstrap`** does what a human would otherwise click:

- creates Plane's instance admin, workspace and project, and mints an API token;
- creates Outline's team and owner, signs in through a magic link it picks up
  from Mailpit, mints an API token with exactly the scopes the syncs need, and
  creates this project's collection;
- writes `.runtime/secrets/plane.env`, `.runtime/secrets/outline.env` and the
  generated admin password to `.runtime/secrets/admin.txt`;
- runs the first `docs-sync` and `plane-sync`.

It is worth knowing *how* the Plane half does that, because it is the one place
this ecosystem reaches past an HTTP API. Plane's god-mode API - the one a browser
uses to sign up and mint tokens - authenticates with an admin session and a CSRF
token whose cookie is HttpOnly, so only Plane's own admin app can read it; it
refuses an API key outright, and its sign-up form answers the CSRF failure page
to anything else. So the bootstrap runs **Plane's own management shell inside its
own api container** and creates the same four objects there: the same models, the
same database, no browser. Everything afterwards uses the API token, which needs
no session. Plane's mail settings are not set by the bootstrap at all - they come
from `plane/overrides.env` through the container environment (see *Mail* below).

**`make verify`** is the exit criterion. It fails, naming the file or item, when
the plan and the published copies disagree, when a recorded document id no longer
resolves, or when a sync would change something.

## Everyday use

```bash
make health              # what answers, and which container holds which port
make ps                  # this ecosystem's containers
make logs S=plane        # or S=outline / S=mail
make docs-sync           # dry run: what would change in Outline
make docs-sync ARGS=--apply
make plane-sync          # dry run: what would change in Plane
make plane-sync ARGS=--apply
make verify
make backup              # dump everything into .runtime/backups/
make mailbox             # read the sink, with any sign-in links extracted
make down                # stop everything; data is kept
make down-hard           # DESTROY the volumes and Plane's data (asks first)
make teardown            # the above, and make the workspace deletable again
```

**Retiring a project.** Plane writes into `.runtime/plane-app/` as container
users, so a plain `rm -rf` of the workspace fails with *Permission denied* on
files you never created. `make teardown` removes the containers, the volumes and
that data (from a container, as root), and keeps the secrets and the sync state so
a re-install can reattach without redoing the bootstrap. `make teardown
ARGS=--all` removes those too. After it, the workspace deletes normally.

Both syncs are dry by default and idempotent: an unchanged file is not
re-published, an edited file updates its existing document, and a work item is
updated rather than duplicated. Neither ever deletes anything.

A project that has not written its plan yet mirrors **nothing**: the scaffold
leaves `docs/roadmap.md` and `docs/extensions.md` with empty tables rather than
placeholder rows, so the first sync publishes the documentation and creates no
work items until somebody states the phases. Fill in the tables, then re-run
`make plane-sync ARGS=--apply`.

## Ports

Eight consecutive ports are probed free and recorded in `.runtime/env`: five for
Plane (web, HTTPS, three SMTP intake ports), one for Outline, two for Mailpit.
`make health` reports what holds each one. If a port is taken later by something
else, the install step fails loudly and names the holder rather than starting a
half-broken stack.

80 and 443 are deliberately left alone: they belong to whatever web server fronts
the application in production.

## Mail

Both services deliver to the Mailpit sink, and neither is configured through its
own UI:

- **Outline** is told by its generated env file (`.runtime/outline.env`), which
  `make outline-install` refreshes from `.runtime/env`.
- **Plane** reads its instance settings from the environment the first time its
  api container starts, so the mail wiring lives in `plane/overrides.env` and is
  applied to Plane's own `variables.env` by `make plane-install`.

The host both are given is `mailpit` (the service name on the shared network) and
the port is **1025**, the port Mailpit listens on *inside* that network - not the
probed port published to the host. Using the published port there fails with
`ECONNREFUSED`, and Outline reacts by quietly disabling email sign-in.

To confirm by hand: `/god-mode` → Email → *send a test message*, or sign in to
Outline and watch for the magic link. Both land in the sink.

## Secrets and where they live

| File | Contents | Protection |
| --- | --- | --- |
| `.runtime/env` | addresses, ports, names, versions — **no secrets** | gitignored, mode 0600 |
| `.runtime/secrets/plane.env` | Plane API token, workspace slug, project id | gitignored, mode 0600 |
| `.runtime/secrets/outline.env` | Outline API token | gitignored, mode 0600 |
| `.runtime/secrets/admin.txt` | the generated Plane/Outline admin address and password | gitignored, mode 0600 |
| `.runtime/plane-app/variables.env` | Plane's settings **and** its generated database, broker and object-store secrets | gitignored with `.runtime/` |
| `.runtime/outline.env` | Outline's signing keys, database password and mail wiring | gitignored with `.runtime/` |

`.runtime/` is the single thing to protect, back up and never commit. If it is
lost, the API tokens are gone (mint new ones with `make bootstrap`) but the data
survives in the volumes.

## Finishing Plane by hand

`make bootstrap` automates all of this. When a step cannot be automated — an API
that refuses, a version that changed its shape — do it in the browser and then
re-run `make bootstrap`, which will notice and continue.

1. Open Plane and sign up. That account owns the workspace. Sign-up is a form
   POST, and every failure comes back as a redirect carrying an error code rather
   than a JSON body, so read the URL.
2. Create a workspace, then a project whose identifier matches
   `PLANE_PROJECT_IDENTIFIER` in `.runtime/env`.
3. Profile → API tokens: create one, and write it into
   `.runtime/secrets/plane.env` as `PLANE_API_KEY`, with `PLANE_WORKSPACE_SLUG`
   and `PLANE_PROJECT_ID` beside it. The project id is the UUID, not the
   identifier: it is the last path segment of the project's URL.
4. `/god-mode` → Email: host `mailpit` (the service name on the shared network),
   port `MAILPIT_SMTP_PORT`, no TLS, any username and password. Then use the
   "send a test message" button and look in Mailpit.

## Finishing Outline by hand

1. An Outline instance with **no team yet cannot offer a sign-in**: `/auth/email`
   answers `403` until a team exists. The first run is
   `POST /api/installation.create` (what `make bootstrap` calls), which creates
   the team, the owner and a session. After that, sign in normally.
2. Sign in with the magic link that arrives in Mailpit.
3. Settings → API tokens: create one with these scopes, which are exactly what
   the syncs use:

   ```
   collections.list  collections.create  documents.list  documents.create  documents.update
   ```

   `documents.delete` is deliberately absent: nothing in this ecosystem deletes a
   document, and a token that cannot is a feature.
4. Paste the token into `.runtime/secrets/outline.env` as `OUTLINE_API_TOKEN`.
   The value is returned **once**, as `data.value` — not `data.token`.

## Traps in Plane

Recorded because each one cost real time. They are already handled by the scripts;
they matter again if you do something by hand or upgrade.

- **An empty `DATABASE_URL` is worse than an unset one.** The bundle ships it
  empty, and its compose reads `${DATABASE_URL:-postgresql://plane:plane@plane-db/plane}`.
  Empty counts as unset for `:-`, so it silently falls back to the public
  `plane:plane` password while PostgreSQL was initialised with the generated one,
  and every request fails with *password authentication failed for user "plane"*.
  `install.sh` rebuilds the URL (and the two other URI settings) from the
  generated password.
- **RabbitMQ's variable names disagree.** The bundle defines
  `RABBITMQ_DEFAULT_USER`/`RABBITMQ_DEFAULT_PASS`, its compose reads
  `RABBITMQ_USER`/`RABBITMQ_PASSWORD`. Generating only the `_DEFAULT_` names
  leaves the broker on the shipped password and every publish fails with
  *ACCESS_REFUSED*. Both names are written.
- **Sign-up returns `500` if `is_telemetry_enabled` is sent** as a form field.
  Omit it — the bootstrap does.
- **A failed sign-up leaves an orphan user.** The user row is created before
  anything else, so a failure later leaves an account with no admin rights, and
  the retry then fails with `ADMIN_USER_ALREADY_EXIST`. The bootstrap stops and
  says so rather than guessing; on a fresh instance the remedy is
  `make down-hard && make install && make bootstrap`.
- **Passwords must pass zxcvbn with a score of at least 3.** A short or
  dictionary-shaped password is refused; the bootstrap generates a random one.
- **HTML comments are stripped from descriptions**, so a marker comment cannot
  identify a work item. Identity is Plane's own `external_id` with
  `external_source` — which is what those fields are for.
- **The v2 API returns neither `external_id` nor descriptions**, so it can only
  match by name. The sync prefers v1 and says when it has to fall back; the two
  versions also spell the state field differently (`state` in v1, `state_id` in
  v2) and silently ignore the other's spelling.
- **API keys are rate limited** (60 requests a minute by default), and a
  rate-limited response carries no `error` key. A sync of a large plan can hit it;
  raise `API_KEY_RATE_LIMIT` in `plane/overrides.env` and re-run.
- **Webhooks and callbacks refuse private addresses**, so anything expecting to be
  called *by* Plane needs a public URL. Work items are mirrored by these scripts
  instead.

## Traps in Outline

- **No team means no sign-in form** (see above): `/auth/email` answers `403`
  until `/api/installation.create` has run once.
- **The magic-link callback wants `follow` as the string `"true"`**, not a
  boolean; the schema rejects the boolean.
- **The API key secret is `data.value`**, returned once, and
  `apiKeys.create` accepts an empty body silently — it will happily create a key
  with no scopes if you forget the scope list.
- **PostgreSQL 18 moved its data directory**: Outline's own sample mounts
  `/var/lib/postgresql` rather than `.../data`, which is what this compose does.
- **The mail port has two values and they are not interchangeable.** Mailpit
  listens on 1025 *inside* the Docker network; the probed port
  (`MAILPIT_SMTP_PORT`) is the one published to the host. Every service that
  delivers mail talks to it container-to-container, so Plane and Outline are both
  configured with the internal port. Using the host port there fails with
  `ECONNREFUSED`, and Outline reacts by quietly disabling email sign-in - so the
  visible symptom is a `403` on the sign-in form, not a mail error.

## General traps

- **Never let generated data sit where an image build can see it.** Everything
  generated is under `.runtime/`, and the scaffold adds `ecosystem` to
  `.dockerignore`. If you move something out of `.runtime/`, add the rule back.
- **Files written with a restrictive umask can be unreadable inside a container**
  while looking perfectly fine to you. If a mounted file raises `PermissionError`
  inside a container, check its mode first — `chmod -R a+rX` on the checkout is
  usually the whole fix.
- **A large collection can overflow the kernel's argument list** when a script
  passes every document's text to `jq` at once (*Argument list too long*). The
  documentation sync keeps compact maps instead of accumulating document bodies.

## Backups, restore and upgrades

`make backup` writes, into `.runtime/backups/<timestamp>/`: both PostgreSQL
databases in custom format, Plane's uploads, Outline's uploads, Mailpit's message
database, Plane's settings file and Outline's env file, plus a `MANIFEST.txt` with
the exact restore commands. Treat an archive as sensitive: it contains secrets.

The settings files are copied, not restored, on purpose: restoring an older one
would rotate secrets the services are already using.

Upgrading is a one-line change in `.runtime/env` (`PLANE_VERSION` or
`OUTLINE_VERSION`) followed by `make plane-install` or `make outline-install`.
Plane's installer keeps the existing settings file and absorbs the keys a new
release adds, warning about any that look like secrets.

## Pointing this at a real hostname

Nothing here decides that the stack is local except `.runtime/env`:

1. Set `ECOSYSTEM_HOST` (and `ECOSYSTEM_SCHEME=https` if TLS terminates in front).
2. Add the hostname to DNS, or `/etc/hosts` today.
3. `make install` again — it rewrites Plane's `WEB_URL`/CORS list and Outline's
   URL to match, which is the part that breaks sign-in if skipped.
4. To terminate TLS here instead, put a certificate in Plane's bundle and set
   `APP_PROTOCOL=https`, or put a reverse proxy in front (the usual choice).

## If something is wrong

| Symptom | First thing to check |
| --- | --- |
| A service does not answer | `make health`, then `make logs S=plane\|outline\|mail` |
| Plane answers `502` | Its database credentials: see the `DATABASE_URL` trap above |
| Plane's API returns 401 | `.runtime/secrets/plane.env` has a stale token: `make bootstrap` |
| Sign-in or magic links fail | `ECOSYSTEM_HOST` must equal the origin in the browser |
| `verify` reports a count mismatch | `make docs-sync ARGS=--apply` and `make plane-sync ARGS=--apply` |
| A port is held by something else | `make health` names the container; change the port in `.runtime/env` |
| Everything is fine but you want a clean slate | `make down-hard`, then `make install && make bootstrap` (this **destroys** the data) |
