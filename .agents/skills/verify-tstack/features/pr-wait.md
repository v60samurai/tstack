# PR watching

`skills/babysit-pr/scripts/pr-wait` watches one PR and prints one line per real event, so `babysit-pr` wakes only when something happened.

## Sub-features

- `merged` exits 0 at once for a merged PR.
- `dirty` reports a conflicting branch and names `resolve-merge-conflicts`.
- `args` rejects bad arguments with exit 2.

## How to get to it (user POV)

- `babysit-pr` runs `skills/babysit-pr/scripts/pr-wait <pr> --repo <owner/name>` under a monitor.

## Driving it with gh

- **Merged PR.** Run `skills/babysit-pr/scripts/pr-wait 3 --repo v60samurai/tstack --until any-change`. It exits 0 and its stdout says the PR merged. It only reads the PR.
- **Bad arguments.** Run `skills/babysit-pr/scripts/pr-wait --interval 1`. It exits 2.
- **DIRTY line.** No live PR is kept in conflict for this. Run `grep -n 'dirty_line =' skills/babysit-pr/scripts/pr-wait` and record that the line tells the agent to merge the base in and resolve it with the `resolve-merge-conflicts` skill. Mark this sub-feature as not driven end to end.

## Gotchas

- pr-wait keeps a lock and state under `~/.local/state/pr-wait/`. A second watcher of the same PR exits 2 at once. Do not watch a PR another agent is babysitting.
