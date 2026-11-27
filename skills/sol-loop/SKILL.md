---
name: sol-loop
description: Use when the user says "sol loop".
---

# sol-loop

This is a workflow for making your code changes more correct before (or
sometimes after) filing a pull request. tl;dr - use OpenAI's GPT Sol to review
your code in a loop.

Make the most minimal possible changes to appease the Sol reviewers. Be careful
of scope creep and don't be scared to push back.

## Budget

- Default: 2 rounds total. Round 1 is full. Later rounds check only the
  commits since the last reviewed SHA.
- Extend to 3 only for security, permissions, auth, data loss, or
  state/concurrency, while a blocker stays open with evidence. Or when the
  user asks.
- Stop early if a round returns only nits. Declined nits and comment,
  doc, or format-only fixes need no new round.
- One reviewer only. Sol must not start subagents or reviewers.
- Keep a ledger: id, severity, INTRODUCED or PRE-EXISTING, outcome, the
  head SHA the round reviewed, usage if returned. Never guess it.
- A caller's "repeat until Sol approves" means this budget, not more rounds.

## 1. Scope

Run `git status --short`. Do not stash, discard, or include unrelated
changes. Limit review to the change paths if they separate cleanly.
Otherwise stop and ask.

Find the base after `git fetch origin`:

- PR: `gh pr view <n> --json baseRefName,headRefOid`. Check out the branch
  only if clean. Confirm `HEAD` is the PR head, or ahead only by this
  change. Base: `git merge-base HEAD origin/<baseRefName>`.
- Local: `git merge-base HEAD origin/<default-branch>`. No remote: a base
  the user names, or `HEAD` for uncommitted changes only.

The change is base to working tree in those paths, with untracked files.
Use one diff command all rounds. State intent and out-of-scope in 1-2
sentences. Run covering checks. Do not send code this change breaks. Note
missing or pre-failing checks in the brief.

## 2. Start Sol

In T3, call `orchestrator_capabilities`. Pick the latest Sol unless the user
named a version. Do not hardcode an ID. Record provider, model, and effort
only if exposed. Use `delegate_task` every round (`role: "review"`,
`mode: "async"`). Save `taskId`. New `clientRequestId` per round.
`childThreadId` is storage, not the next target. Do not use
`t3_thread_send`, `create_threads`, or `t3_thread_launch` for review.

If T3 tools are not listed, try one direct capability call. Outside T3, use
a fresh native Sol subagent each round. In Claude Code, use a custom subagent
only if it is set up to run Sol. If no route runs Sol, report the blocker. Do
not substitute a model.

Do not edit scoped files while review runs. Wait for the notice. Do not
poll or start a second reviewer. Timeout, error, or no reply is not
approval. On failure, cancel, verify stop, restart. A clean reply that does
not say what Sol read and why the change holds is a failed round: rerun it
once.

The brief (T3 children get no history). Add the repository's `REVIEW.md` path
when it has one. Never add earlier findings, your case for the design, or a
request for approval: a reviewer asked to approve tends to approve.

```
Review only. Do not edit, commit, push, comment on PRs, or start subagents.
Repo: <abs path> Base: <sha> Head: <sha> Intent: <intent> Out of scope: <scope> Checks: <results>
Review: git diff <from> [-- <paths>]; git status --short (read untracked).
Context only, not for findings: <earlier range in later rounds, else none>. Repo rules: <REVIEW.md or none>.
Serious however rare the trigger: data loss or corruption, auth or permission
bypass, another user's data, an irreversible external write, a broken caller.
Never blocking: style, naming, anything CI already enforces.
Find what would break this change or block it from shipping. Read surrounding code.
For each finding give the literal steps that trigger it and who does them; a
finding with no trigger is not a finding. Label it INTRODUCED (by this diff)
or PRE-EXISTING. Flag code, tests, or guards the intent does not need. Prefer
one strong finding to several weak ones, say when a claim is inferred, and
report at most 5 nits.
blocker = intended case wrong. should = real bug callers will hit, in intent. nit = rest.
If nothing survives, say what you read, what you expected to find, and why it holds.
Reply in under 600 words:
S1 [blocker|should|nit] [INTRODUCED|PRE-EXISTING] <file>:<line> <claim>. Trigger: <steps, who>. Fix: <suggestion>
```

## 3. Answer findings

Sol's severity and labels are claims. Triage each finding before you fix it:

1. Write one sentence on what goes wrong for the person. If it does not
   sound bad read aloud, it is a nit.
2. Check that the code permits the trigger. Most findings fail here.
3. A trigger that needs a rare precondition is a nit unless it loses data
   or crosses a trust line: two actors at once, a dependency failing at that
   instant, two acts in the same second, deleting what running work needs,
   state only an unreleased build writes, an unsupported device.
4. Check INTRODUCED against the base (`git show <base>:<file>`). A
   PRE-EXISTING finding goes to follow-ups and opens no round, unless it is
   a blocker.

Another path or small cost is a nit, whatever label it came with.

- Agree: smallest fix. Prefer delete or narrow over new lock, cache,
  helper, or option. Fix the case that happened. Add one focused test
  that fails without the fix, if intent needs it. Run it on the tree before
  the fix: if it passes there, the finding was false, so revert the fix.
- One mechanism drew findings two rounds running: stop patching it and
  rethink it before the next fix.
- Disagree: say why, with evidence (file:line, test, output).
- Out of scope or nit: decline in one line. List as follow-up.

Update the ledger. Re-run checks and `git diff --shortstat <base>`. If
review grew the diff, cut first. Do not agree just to end the loop.
When you decline the same kind of finding again in this repository, propose
a one-line rule for its `REVIEW.md` in your report. Write it only if the user
says so.

## 4. Next round

Start one only if budget remains and you fixed a blocker or should. Use a
fresh reviewer every round: a new `delegate_task` in T3 or a new `codex exec`,
never a resume. Send the same brief with `Review` set to the commits since the
last reviewed SHA and the earlier range as context only. Do not send the
ledger. Match each new finding against it yourself: a repeat keeps its
recorded outcome unless it brings new evidence.

## 5. Stop and ship

Clean: the last round ran on the current head SHA, nothing was fixed after
it, and after your triage it left no INTRODUCED blocker or should, no
blocker of any age, and no concern of your own. Stuck: budget ends with a
blocker or should open. Show both sides in 2-3 lines each. The user decides.
Budget end is not approval.

Do not push during the loop. Push after a clean round only if the user asked
to push, ship, or update the PR. If you push to a PR, add above the model
blurb:

`Reviewed with sol-loop: <N> rounds with <model>. Sol verdict: approved`.

Add `on <effort>` only if verified.

Report: rounds, model, what Sol changed, diff size before/after, fixed and
declined findings with reasons, pre-existing follow-ups, any proposed
`REVIEW.md` rule, usage if exposed (else say not), pushed or not.
