# Draftmancer upstream

Gulchdale Phase 1 is a tracked fork of [Draftmancer](https://github.com/Senryoku/Draftmancer).

- Upstream remote: `https://github.com/Senryoku/Draftmancer.git`
- Phase 1 base revision: `11f056cc1be6f99795f89d8dc7111d98f1a83c6a`
- License: MIT; retain the repository `LICENSE` and upstream attribution.

## Synchronizing upstream

Work on a dedicated update branch and never merge an unreviewed moving target directly into a release branch.

```bash
git fetch upstream master
git switch -c codex/draftmancer-update
git merge --no-ff upstream/master
npm ci
npm run build
npm test
npm run client-type-check
```

Resolve conflicts by keeping Gulchdale's environment lock, runtime endpoints, branding, committed cube snapshot, and Docker persistence behavior. Record the new upstream commit in this file and in `src/Gulchdale.ts` after all checks pass.
