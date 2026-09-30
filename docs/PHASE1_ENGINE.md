# Phase 1 engine operations

## Run on a local network

The production container exposes Gulchdale on the uncommon high host port `43721` by default to avoid colliding with development servers:

```bash
docker compose up --build -d
docker compose ps
```

Open `http://localhost:43721` on the host or `http://HOST_LAN_IP:43721` from another device. To choose another host port, set `GULCHDALE_PORT` before starting Compose, for example `GULCHDALE_PORT=45000 docker compose up --build -d`.

Stop the service gracefully so active session state is written to the persistent Docker volume:

```bash
docker compose down
```

The named `gulchdale-state` volume stores Draftmancer connection and session recovery data. `docker compose down` preserves it; `docker compose down --volumes` intentionally removes it.

## Health and environment identity

- `GET /healthz` reports readiness, the pinned Draftmancer revision, and the SHA-256 hash of the committed environment.
- `GET /api/gulchdale/config` exposes the public runtime defaults and lock state used by the client.

The server parses `data/cubes/gulchdale.txt` before listening. An invalid or missing snapshot prevents startup. The file is loaded once; replacing it on disk cannot mutate an active process or draft.

## Local development

Use Node.js 22, matching the production image:

```bash
npm ci
npm run build
npm test
npm run test-gulchdale-acceptance
npm run client-type-check
npm start
```

The dedicated acceptance suite runs a complete four-stage draft with two Socket.IO clients and six bots, disconnects and reconnects one human mid-draft, and verifies the environment lock and restored pool.

The development server listens on port `3000` unless `PORT` is set. Local session persistence defaults to `./tmp`; set `DISABLE_PERSISTENCE=TRUE` only for disposable development runs.

## Gulchdale behavior

Every production session receives a fresh clone of the bundled environment. The server fixes the player limit at eight, defaults the timer to zero, starts with no bots, and disables CubeCobra result publication. Hosts may change safe session properties such as bot count and timer, but cannot replace or modify the card environment.

The current snapshot defines these packs:

1. 4 Commander + 16 Mono
2. 2 Commander + 18 Mono
3. 20 Mono
4. 20 Land

Each pick takes two cards. This differs from an earlier planning outline that described separate Multicolor and Acceleration sheets; those sheets are not present in the current generated environment.

## Troubleshooting

- **Startup fails with a Gulchdale parsing error:** restore or regenerate `data/cubes/gulchdale.txt`; do not bypass startup validation.
- **A returning player cannot reconnect:** reuse the same browser profile and invite URL so Draftmancer's saved user ID matches the disconnected seat.
- **Cards render without images:** the server is local, but the snapshot and upstream card database use remote image URLs that require internet access from the browser.
- **Container is unhealthy:** inspect `docker compose logs gulchdale`, then verify both `/healthz` and the persistent volume permissions.

See `UPSTREAM.md` before importing a newer Draftmancer revision.
