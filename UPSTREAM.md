# Draftmancer upstream

Gulchdale contains a source snapshot of [Draftmancer](https://github.com/Senryoku/Draftmancer), adapted into the self-hosted Gulchdale engine.

- Upstream repository: `https://github.com/Senryoku/Draftmancer.git`
- Phase 1 snapshot revision: `11f056cc1be6f99795f89d8dc7111d98f1a83c6a`
- License: MIT; retain the repository `LICENSE` and upstream attribution.

The `upstream` remote is retained for discovery and comparison only. Gulchdale's primary repository intentionally does not contain Draftmancer's full Git history.

## Updating the upstream snapshot

Never merge, rebase, subtree-import, or otherwise copy Draftmancer's Git ancestry into this repository. In particular, do not run `git merge upstream/master` (or the equivalent for any upstream branch). Doing so would make every clone and push carry the upstream project's entire historical object database again.

For an update:

1. Choose and record one immutable upstream commit SHA.
2. Download that exact revision as a GitHub source archive, or create a temporary shallow checkout outside this repository.
3. Verify the archive or checkout resolves to the selected SHA.
4. Copy only the required source files into a new branch created from Gulchdale `main`. Never copy the temporary checkout's `.git` directory.
5. Review the resulting tree diff and preserve Gulchdale's environment lock, runtime endpoints, branding, committed cube snapshot, Docker persistence behavior, `LICENSE`, and attribution.
6. Update the revision in this file and in `src/Gulchdale.ts`.
7. Commit the source update as a normal snapshot commit after running:

   ```bash
   npm ci
   npm run build-server
   npm test
   npm run test-gulchdale-acceptance
   npm run client-type-check
   npm run build-client
   docker build --tag gulchdale-upstream-check .
   ```

This keeps future update branches limited to the content that actually changed between the two snapshots.
