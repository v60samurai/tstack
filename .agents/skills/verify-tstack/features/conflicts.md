# Conflict resolution

`resolve-merge-conflicts` resolves a stopped merge of the base branch from the conflict hunks alone, then proves nothing is left before the merge is committed.

## Sub-features

- `summary` lists unmerged paths, their index stages and hunk counts.
- `detail` prints the ours, base and theirs sections of one file's hunks.
- `check` exits 1 while a path is unmerged or a changed file holds a conflict marker, and 0 once resolved.

## How to get to it (user POV)

- `modernize` step 3, `babysit-pr`'s base-branch section, and `pr-wait`'s DIRTY line send the agent to the skill.
- Stack Pilot's `restack.sh` prints the skill's name when its merge stops.

## Driving it with fixtures.sh

Set `ctx="python3 skills/resolve-merge-conflicts/scripts/extract_conflict_context.py"` and `sh .agents/skills/verify-tstack/fixtures.sh conflict "$run/c"`.

- **Summary.** `$ctx --repo "$run/c"` prints `conflicted files: 1` and `notes.md | type=text | stages=1,2,3 | hunks=1`.
- **Detail.** `$ctx --repo "$run/c" --file notes.md` shows `line one from feat` and `line one from main`.
- **Unresolved.** `$ctx --repo "$run/c" --check` exits 1 and prints `unmerged: notes.md`.
- **Markers staged by mistake.** `git -C "$run/c" add notes.md`, then `--check` exits 1 and prints `conflict marker: notes.md:1`.
- **Resolved.** Write `line one from both` to `notes.md`, `git add` it, and `--check` exits 0 with `resolved: no unmerged paths and no conflict markers in changed files`. Then `git -C "$run/c" -c user.name=v -c user.email=v@x commit --no-edit -q` makes a merge commit with two parents (`git -C "$run/c" rev-list --parents -1 HEAD` prints three hashes).

## Gotchas

- The skill must say merge only, with no rebase and no force push. Check it still does.
