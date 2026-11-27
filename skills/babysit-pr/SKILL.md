---
name: babysit-pr
description: Monitor a pull request through review and CI. Use when the user asks to monitor, watch, or babysit a PR.
---

# Babysit PR

You own this PR from the moment it opens until it is merge-ready. One writer
at a time touches its branch: you, or the fixer, never both. You never
force-push and never merge.

## Who does what

- **Review bot.** One bot reviews the PR: Codex cloud review
  (`chatgpt-codex-connector[bot]`, the AI-Dev ChatGPT account), steered by the
  `## Code Review Rules` section of the repo's `AGENTS.md`. It posts P0 and P1
  findings only. If it has not reviewed the head, comment `@codex review`
  once, bare. If Codex never responds, it is not connected to the repo: wait
  with `pr-wait --until green`, and the final report says the review bot is
  missing. If another review bot comments, treat it as advisory and tell Harshit
  it is still switched on.
- **Fixer.** Claude PR Steward fixes blockers. Start it on the PR with a
  top-level comment that is only `@claude steward`, with no note callout.
  If neither a reaction nor a progress comment from Steward appears within 10
  minutes, Steward is not installed on the repo: the debugger subagent fixes
  blockers instead, and the final report says Steward is missing. It pushes as
  `Claude <noreply@anthropic.com>`, fixes failing checks in code the PR
  touches, and makes small requested changes. While Steward is on, you make
  no commits to the branch. Never use `@claude steward` on a PR you were not
  asked to babysit.
- **Debugger.** A CI failure Steward cannot fix (it reports one, or the same
  check fails twice after its pushes) goes to a scoped debugging subagent with
  the failing log lines (`gh run view --log-failed`). Comment `@claude stop`
  before that subagent pushes, and start Steward again after.
- **No new full review.** A fixer commit gets CI and the review bot only.
  Do not run `sol-loop` again for it.
- **Reverts.** Steward can redo a fix after a revert. Comment `@claude stop`
  first, then revert its commits, then decide whether to start it again.

A finding that is not a P0 or P1 blocker goes to the PR's Follow-ups section
with one line, not to the fixer.

## Waiting

Never write your own watcher, polling loop, or `sleep` loop. Use one watcher
per PR: `watch_pull_request` in T3 Code, `pr-wait` everywhere else. Never run
both on the same PR. Every watcher on a GitHub account shares one rate limit.

### In T3 Code: `watch_pull_request`

Handle the existing checks and comments first. Then call
`watch_pull_request` and end your turn. T3 Code wakes you with a message when
a check fails, the required checks pass, someone comments or reviews, or the
branch conflicts.

- **Only the thread that owns the PR watches it.** If you are a delegated
  child task (a reviewer, a Sol round, any `delegate_task` child), never call
  `watch_pull_request`. The parent owns the PR. Do not watch PRs you are not
  working on.
- **A wake is news, not a merge decision.** Check the merge gate yourself.
- **Unwatch when you hand off.** A watched thread stays in Working and out of
  the user's inbox. When you stop (ready, blocked, or asking the user a question),
  call `unwatch_pull_request` first. A merge or close ends the watch on its
  own.
- **"Stopped watching, could not read it"** usually means GitHub's rate limit
  is used up. Run `gh api rate_limit --jq .resources.graphql` before you
  watch again. If `remaining` is near 0, wait for `reset` with one background
  command, then watch again. Never watch again in a tight loop.

### Everywhere else: `pr-wait`

Wait with `scripts/pr-wait` from this skill's directory (use its absolute
path).

```bash
pr-wait <pr> [--repo owner/name] [--until ready|green|any-change]
```

It prints one line per real event. It exits 0 when the `--until` condition is
met or the PR merges, 1 when it needs you (a required check failed, conflicts,
unresolved threads, PR closed), and 2 on bad input.

- `ready` (default): required checks green, Codex cloud review (or Greptile
  or Macroscope) reviewed the head, and no unresolved threads. Use this to
  babysit.
- `green`: required checks only. Use it when the repo has no review bot.
- `any-change`: exit on the first event.

In Claude Code, run it with the Monitor tool (`timeout_ms: 3600000`), so each
line wakes you. Without a monitor, run it as one long command. It ends on its
own.

Start it again after you push, after you handle an exit 1, and after a resume.
It remembers what it already reported, so nothing that arrived in between is
lost. If it says another pid already watches the PR, do not start a second one.
Kill the old one only if its events do not reach you.

With either watcher: when an event needs no action, end your turn without a
message. Never post or say "still waiting".

## GitHub rate limits

`gh pr create`, `gh pr view`, and `gh pr checks` use GraphQL. When GraphQL is
used up, the REST limit is separate and usually still has room. Use
`gh api repos/<owner>/<repo>/pulls/<n>` to read a PR, and
`gh api repos/<owner>/<repo>/commits/<sha>/check-runs` for checks.

## Reviews

Only act on checks and comments newer than the latest push. Verify every bot
finding against the source before changing code. Fix real findings and CI
failures, distinguish repository failures from infrastructure flakes, and reply
with a written reason when dismissing false positives.

If the repo has `.macroscope/check-run-agents/*.md`, read those rules before you
reply to a Macroscope finding. Its findings cite them.

CodeRabbit is advisory. Treat its findings like any other finding, but never
wait for it and never hold a merge for it.

If a review bot leaves feedback you believe is not worth addressing, reply with
a written reason and resolve the comment. Use the `leaving-pr-comments` skill
for every comment posted on the user's behalf.

Screenshots and videos help as well, when you have a way to upload them.

Keep the PR at the size the user's goal needs. Review loops tend to grow a
PR one cheap-looking fix at a time. Fix real bugs in the intended case.
Decline the rest with a written reason, and list them as follow-ups:
unneeded tests, guards for edge cases that do not matter, extra integration
or compatibility, and small performance costs. Prefer the fix that deletes or
narrows code.

## Base branch and merging

Keep an eye on changes to `main` and rebase when needed. `pr-wait` reports when
new base commits touch this PR's files, and when the PR becomes BEHIND or DIRTY.
`watch_pull_request` reports conflicts only, so check for BEHIND yourself
before you call the PR ready.
If an overlapping PR makes this one obsolete, stop monitoring, report it to the
user, and ask before closing the PR unless closure was explicitly authorized.

If nothing has changed, stay quiet rather than posting filler comments. Stop
when `pr-wait` exits 0, or in T3 Code when the merge gate passes on the latest
head. Merge only when the user explicitly requested it;
otherwise report that the PR is ready. Right before a merge, run `git fetch` and
check the PR again. Never merge when it is BEHIND or DIRTY, or when base commits
that landed after the last green run touch this PR's files. Rebase, push, and
wait for green again.
