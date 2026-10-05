# Gulchdale hardening policy

This document separates Gulchdale release risks from maintenance noise inherited with the pinned Draftmancer source snapshot. Gulchdale is not a general-purpose Draftmancer distribution and does not need to track every upstream feature or dependency release.

## Current assessment

As of 2026-10-03:

- The production dependency tree reports no known npm vulnerabilities (`npm audit --omit=dev`).
- The full dependency tree reports fourteen advisories: twelve high, one moderate, and one low. They are confined to development tools and their transitive dependencies: Puppeteer, Mocha, Nodemon, `serialize-javascript`, `extract-zip`, `braces`, and proxy helpers.
- The production build, Vue type check, compiler tests, and dedicated Gulchdale acceptance test pass.
- The inherited Draftmancer suite produced three non-Gulchdale failures in the full run. The randomized booster case passed when rerun in isolation, indicating order-dependent or randomized suite pollution rather than a reproducible Gulchdale defect. The other two deliberately force an external bot API; an unrelated service on local port 8080 returned HTTP 200 with an invalid version payload and was incorrectly treated as DraftmancerAI. These do not block Gulchdale's simple-bot draft path.
- No Cloudflare Tunnel configuration, hostname, process definition, or tracked tunnel deployment artifact exists in this repository. The Docker and nginx files are the supported local/self-hosted runtime and should remain. `reference/prototype/` is historical product reference, not a Cloudflare deployment.

The raw npm advisory total is therefore not a reason to update the Draftmancer snapshot or perform major-version upgrades before Phase 4.

## Implemented baseline

The first hardening pass now:

- disables the inherited weekly Dependabot version-update stream;
- makes the required server workflow run the production dependency audit, focused Gulchdale tests, the production-engine acceptance test, and the Docker build;
- moves the full inherited Draftmancer test suite to a manually dispatched compatibility workflow;
- disables implicit DraftmancerAI discovery unless `DRAFTMANCER_AI_DOMAIN` is explicitly configured and validates its version response before enabling it;
- validates and acknowledges player display-name and moderation socket operations;
- brands the installable application manifest as Gulchdale.

These changes deliberately avoid broad dependency upgrades or upstream synchronization.

## Maintenance boundary

Treat Draftmancer as a pinned engine snapshot:

1. Do not merge or routinely synchronize upstream history. Follow `UPSTREAM.md` only when Gulchdale needs a specific upstream fix.
2. Do not accept broad dependency-update pull requests solely to make version numbers current.
3. Patch a dependency immediately only when it affects the deployed production tree or a build tool that processes untrusted input in Gulchdale's release workflow.
4. Review production advisories before a public deployment and on a deliberate periodic schedule after deployment.
5. Keep the MIT license and Draftmancer attribution even when unused upstream surfaces are removed.

## Recommended GitHub and CI changes

These changes are release hardening work, not prerequisites for Phase 4 design:

1. Disable the inherited weekly Dependabot version-update stream, or replace it with a low-frequency, grouped policy when public hosting approaches. GitHub security alerts can remain enabled independently.
2. Make the required pull-request gate Gulchdale-specific:
    - server build;
    - client type check and production build;
    - compiler lint, typing, and tests;
    - Gulchdale unit and acceptance tests;
    - production Docker build.
3. Move the entire inherited Draftmancer suite to a manual or scheduled compatibility workflow. Its external-bot test must be skipped unless a test service is explicitly configured, and randomized assertions should use a deterministic seed.
4. Remove or disable generic upstream services and API surfaces only after an endpoint/socket inventory. Do not spend Phase 4 effort refactoring unrelated draft modes.
5. Disable implicit DraftmancerAI discovery for Gulchdale unless a service URL is configured, and validate the `/version` response schema before marking a bot service available.

## Before public hosting

The temporary friend-test tunnel is not the production security boundary. Before exposing Gulchdale on a permanent host:

- terminate TLS at a maintained reverse proxy;
- configure trusted proxy behavior and explicit allowed origins;
- add request/body limits and rate limits to session creation, join validation, and public APIs;
- disable unused generic Draftmancer HTTP and Socket.IO capabilities where practical;
- keep compiler promotion and filesystem access outside player/session-owner authority;
- run the production-only dependency audit and build the exact release image;
- back up and test restoration of the persistent session volume;
- verify logs do not contain invitation secrets, API tokens, or full private deck data;
- perform the two-browser draft, reconnect, final pool, and export smoke test.

PWA metadata now uses Gulchdale branding. The inherited square PNG icon artwork should be replaced with reviewed Gulchdale icons before treating the installable PWA presentation as complete.
