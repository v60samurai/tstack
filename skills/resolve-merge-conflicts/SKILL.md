---
name: resolve-merge-conflicts
description: Resolve the conflicts a merge of the base branch stopped on, reading only the conflict hunks instead of whole files, then prove nothing is left unresolved and rerun the checks. Use when modernize, babysit-pr, pr-wait or Stack Pilot's restack.sh reports a conflict, or git status shows unmerged paths.
metadata:
  credits:
    - skill: resolve-merge-conflicts
      author: Warp
      url: "https://github.com/warpdotdev/common-skills/blob/main/.agents/skills/resolve-merge-conflicts/SKILL.md"
      license: "MIT, see NOTICE"
---

# Resolve merge conflicts

Adapted from Warp's `resolve-merge-conflicts` skill (MIT, see `NOTICE`).

This flow only merges. A branch is brought up to date with `git merge origin/<base>`, never a rebase, and pushed normally. A hook refuses every force push. `restack.sh` stops with nothing changed, so start its merge again with the command it printed.

`scripts/extract_conflict_context.py` sits next to this file. Below, `ctx` means `python3 <this skill's folder>/scripts/extract_conflict_context.py`. Run it from the repository root.

## Steps

1. **Summary.** `ctx` lists each unmerged path, its index stages and how many hunks it has.
2. **One file at a time.** `ctx --file <path>` prints nearby context, the ours, base and theirs sections of each hunk, and a short diff between ours and theirs. Read the whole file only when that is not enough to decide.
3. **Resolve it** by the PR's intent and the base branch's newer invariants. Take one side whole with `git checkout --ours -- <path>` or `--theirs` when that is right, or edit the hunks and delete the markers. If a conflict shows a product or architecture disagreement, stop and hand it to Harshit with both sides. Do not guess. Then `git add <path>`.
4. **Prove it is resolved.** `ctx --check` exits 0 only when no path is unmerged and no changed file, staged or in the working copy, holds a `<<<<<<<`, `|||||||` or `>>>>>>>` line. Fix what it lists and run it again.
5. **Commit the merge** with `git commit --no-edit`, so the repository's commit hooks run.
6. **Run the checks.** `node ~/dotfiles/machine/verdict/verdict.mjs checks` on the clean merge commit. The merge is a new head with no verdict, so the verifier runs again before the PR is called ready (full-send steps 2 and 3).
7. **Push normally.** Merging the base in never needs a force push.

## Other views

- `ctx --all` shows every conflicted file in detail.
- `ctx --file <path> --json` gives the same detail as JSON.
- `--context <n>` and `--max-lines <n>` change the output size.
- Index-only conflicts (add/add, modify/delete) have no markers. The script shows a preview of each index stage instead.
