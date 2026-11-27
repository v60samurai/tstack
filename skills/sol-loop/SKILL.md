---
name: sol-loop
description: The one pre-PR review. Use when the user says "sol loop", "pr flow", or asks to open a PR, and before any PR is filed.
---

# sol-loop

One review of the finished change by the model that did not write it, before
the PR opens. `scripts/review-gate.mjs` (absolute path from this skill's
directory, called `review-gate` below) holds every limit. Prose here never
grants another round: when the script refuses, the loop is over.

Make the smallest change that answers a real blocker. Push back on the rest.

## The limits (enforced by the script)

- Checks pass on the exact commit, on a clean tree, before any round.
- Only blockers count. Should-fixes and nits go to follow-ups and get no fix.
- A blocker closes with a test that fails without the fix and passes with it,
  or with a decline and a reason.
- At most one more round, on the fix commits only. There is no round 3.
- A risky change (the repo's risky paths, or a security, auth, data-loss or
  concurrency blocker) goes to Harshit instead of getting round 2.

## 1. Start

Run `git status --short`. Commit only this change's files; do not stash or
discard anything else. If the repo has no `.review-gate.json`, stop and ask
Harshit for its check commands and risky paths.

```bash
review-gate init            # base = merge-base with the default branch; --base <ref> for a stacked PR
review-gate check           # typecheck and the tests the change reaches, on HEAD
review-gate round start     # prints the round, the reviewer and the diff range
```

`init` reads the commit trailers to see who wrote the change. Pass
`--author claude|codex` when it asks.

## 2. Run the reviewer

The reviewer is the other model family, as `round start` prints it:

- Claude wrote it: Sol. In T3, `delegate_task` with `role: "review"`,
  `mode: "async"`. In Claude Code, `CODEX_HOME=~/.codex-ai-dev codex exec`
  per `~/.claude/references/codex.md`, after
  `node ~/dotfiles/machine/codex-ai-dev/setup.mjs` exits 0. In Codex, a native
  subagent on the default model.
- Codex wrote it: Claude Opus. In Claude Code, an Agent with `model: "opus"`.
  In Codex, `claude -p --model opus --permission-mode plan`.

One reviewer, fresh each round, never resumed. Do not edit files while it
runs. A timeout or an empty reply is not approval: rerun that round once.

The brief. Never add earlier findings, your case for the design, or a request
for approval.

```
Review only. Do not edit, commit, push, comment on PRs, or start subagents.
Repo: <abs path> Range: <the range round start printed> Intent: <1-2 sentences> Out of scope: <scope>
Rules: the "## Code Review Rules" section of the repo's AGENTS.md files that cover the changed paths. Do not raise a finding those rules say to skip.
Find what breaks the intended case or blocks shipping. Round 1: read the callers of changed code. Round 2: review only the range; earlier code is context.
Each finding gives the literal steps that trigger it and who does them; no trigger, no finding.
Label each INTRODUCED or PRE-EXISTING, and tag security, auth, data-loss or concurrency when it applies.
blocker = the intended case is wrong or a caller breaks. should = a real bug outside the intended case. nit = the rest, at most 5.
If nothing survives, say what you read and why the change holds.
Reply in under 500 words:
S1 [blocker|should|nit] [INTRODUCED|PRE-EXISTING] [security|auth|data-loss|concurrency|-] <file>:<line> <claim>. Trigger: <steps, who>.
```

## 3. Record and answer

Severity is the reviewer's claim. Before recording a blocker, check that the
code permits its trigger. If it does not, record it as `should`. Record every
finding:

```bash
review-gate finding add --sev blocker|should|nit --label introduced|pre-existing [--risk security|auth|data-loss|concurrency] --file <path> --claim "<one line>"
review-gate round end --read "<what the reviewer read and why the change holds>"
```

For each blocker, either:

- Fix it with the smallest change, commit the fix and a focused test, then
  `review-gate finding fix <id> --files <test files> --cmd "<test command>"`.
  The script puts the rest of the tree back to the reviewed commit, expects
  the test to fail, then expects it to pass on HEAD. If the test passes
  without the fix, the finding was false: revert the fix and decline it.
- Or decline it with evidence: `review-gate finding decline <id> --reason "<file:line, test or output>" --kind <kebab-slug>`.
  Add `--by harshit` only when Harshit declined it himself.

## 4. Round 2, only if a blocker was fixed

```bash
review-gate check && review-gate round start
```

Same brief, with the fix range. Record and answer as in step 3. After round
2, open blockers are fixed with a test or declined. No round 3 runs.

## 5. Finish

`review-gate verify` approves the exact HEAD and prints the marker for
filing: `REVIEW_GATE=<sha> gh pr create ...`. Any commit after approval needs
`check` and `verify` again.

When it refuses with "escalated", show Harshit the findings and the fix
commits in 2-3 lines each and stop. File only on his word, with
`SOL_LOOP=waived`. A docs-only diff skips the loop with `SOL_LOOP=docs-only`.

`review-gate status --md` prints the review, checks and follow-ups sections
for the PR body. `file-pr` puts them in.

Report: rounds, reviewer, findings fixed (with tests) and declined (with
reasons), follow-ups, and the approved SHA.
