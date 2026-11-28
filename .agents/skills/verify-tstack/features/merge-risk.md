# Merge risk

`merge-risk` rates a PR low, medium or high and names every sensitive area it touches. `file-pr` puts its block first in the PR body.

## Sub-features

- `areas-by-path` names auth, permissions, secrets, payments, PII, migrations, dependencies and infra/config paths.
- `areas-by-content` flags a credential-shaped added line and a dependency version change in `package.json`.
- `none` prints `none` for a branch that touches nothing sensitive.

## How to get to it (user POV)

- `file-pr` step 1 runs the `merge-risk` skill on the PR head.
- The skill's Gather step 2 runs `skills/merge-risk/scripts/sensitive-areas` from the repository root.

## Driving it with fixtures.sh

- **Sensitive branch.** Run `sh .agents/skills/verify-tstack/fixtures.sh sensitive "$run/s"`, then `python3 skills/merge-risk/scripts/sensitive-areas --repo "$run/s" --base main`. The output has one tab-separated line each for `auth` (`src/auth/login.ts`), `payments` (`src/billing/invoice.ts`), `migrations` (`db/migrations/002_users.sql`), `infra/config` (`.github/workflows/ci.yml`), `dependencies` (`package.json`, a version string changed) and `secrets` (`src/client.ts`, an added line looks like a credential). `docs/guide.md` does not appear.
- **Default base.** In the same repository, run `git -C "$run/s" branch -m main trunk` and then the script without `--base`. It exits 2 with `no base found: pass --base`, because the fixture has no `origin`.
- **Nothing sensitive.** Run `git -C "$run/s" switch -qc docs-only trunk`, add and commit `docs/other.md`, then run the script with `--base trunk`. It prints `none`.

## Gotchas

- The script reports what it matched. The skill tells the agent to keep every hit and explain a false positive, never to drop it. Check that the SKILL.md text still says so when it changes.
