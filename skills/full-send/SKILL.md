---
name: full-send
description: Trigger this if the user says 'full send'.
---

# Full Send

If the user triggered this, it's because they are not watching this thread, and
they want you to complete the work end-to-end autonomously. Your updates and
your final message go unread until long after you stop. You own the work from
its current state to a merged PR.

If the user did not explicitly request "full send" in some clear way, do not
assume full autonomy. If they did, everything below applies.

The user grants you permission to:

- Merge the PR once the merge gate passes.
- Push the PR's own branch. Never force-push any branch. A hook refuses every
  force push.
- Use the test methods that Proof needs, without asking first.

## Testing permission

A "full send" request is the permission. If a project file or other
instruction says to ask before a test method, or to leave testing to the
user, this request replaces that rule for this task.

That includes ask-first rules for computer use, browser automation,
simulators and devices, running the app or a dev server, screenshots, and
visual checks. Use the method that gives direct proof. List it in the
report.

Rules about how to test still apply. Follow rules that name the correct
command, fixture, or check. This permission only removes the ask-first or
leave-it-to-the-user step. If a preferred method cannot prove the change,
use a gated method under this permission.

It covers only the tests needed for this task. It does not add permission
for the steps under "Asking the user", such as production changes or data
deletion. It also does not bypass a harness or system approval prompt if
one appears.

## Steps

1. **Finish the change.** Complete the goal from the user's request with the
   smallest change that works. Fix the case that happened, not every case
   that could. If you are on the default branch, create a branch first.
   Bring the branch up to date by merging the latest default branch in
   (`git merge origin/<base>`), never by rebasing. Commit.
2. **Prove it with runs.** On a clean tree at the exact HEAD, run
   `node ~/dotfiles/machine/verdict/verdict.mjs checks`. With no arguments it
   runs the repo's lint, typecheck, build and test scripts. To run other
   commands, pass them as `-- '<cmd>' ...`. If the branch has a `fix:` commit,
   also run `verdict.mjs regression -- '<command that runs the new test>'`. It
   proves the new test fails on the base and passes on HEAD. See "Proof".
3. **Verify like a user.** A second agent that did not write the code runs
   the repo's `verify-<app>` skill (under `.cursor/skills/`, `.claude/skills/`
   or `.agents/skills/`) against HEAD, through
   `~/dotfiles/machine/verdict/verify.sh`. When Claude wrote the code, run
   `verify.sh codex <repo> verify-<app> "<what the change promises>"`: a
   separate `codex exec` on the ChatGPT ai-dev account with `gpt-6.2-sol` at
   high reasoning effort. When Codex wrote the code, run `verify.sh claude
   <repo> verify-<app> "<what the change promises>"`: a separate `claude -p`
   session. Run it from your own shell. The verifier reads the skill by path,
   drives the change the way a user would, writes `evidence.md` (the full HEAD
   SHA, each command, its output and the screenshot paths) and runs
   `verdict.mjs record --verdict PASS|ISSUES|BLOCKED`. You never run
   `record`. A hook stamps the record with the verifier's identity, and the
   gate rejects a record from an agent that committed or edited the change.
   If the repo has no verify skill, create one with
   `/create-verification-skill` first, in its own PR. When the change alters
   a user flow, run `/maintain-verification-skill`. Where a bug is costly
   (money, auth, data loss, concurrency, state machines), also use
   `/create-formal-verification-skill`, and keep it current with
   `/maintain-formal-verification-skill`.
4. **Fix and re-verify.** Only findings backed by a run count: a failing
   test, a repro script, or real command output. Reviews are optional, such
   as `interrogate` on request, Codex, or review bots. Drop style, naming,
   and hypothetical findings. Log nice-to-haves with `verdict.mjs followup
   "<text>"` and never fix them in this PR. Each real finding gets a
   regression test. Then run steps 2 and 3 again on the new commit. After
   three verdicts on the branch that are not PASS, `verdict.mjs` refuses
   more and the gate blocks. Stop and ask the user, with the evidence.
   A spec mismatch the verifier proved (its `## Spec mismatches for Harshit`
   section) is a question, not a finding to fix. Ask the user, mismatch by
   mismatch, whether to fix the code or update the spec, and change nothing
   until they answer.
5. **File the PR** with the `file-pr` skill once the verdict for the head is
   PASS. A hook refuses `gh pr create` until `verdict.mjs gate` passes for
   the head. The body opens with the `merge-risk` block and includes the
   output of `verdict.mjs body`.
6. **Babysit the PR** with the `babysit-pr` skill. Fix real findings and CI
   failures. A fix makes a new head with no verdict, so run steps 2 and 3
   again on it before you call the PR ready or merge it.
7. **Merge** when the merge gate passes.
8. **Report** in your final message: the PR link, the merge commit, your proof,
   and each decision you made for the user.

Stay active from step 1 to step 8. If you end your turn while checks or bots are
pending, the work stops, because nobody will prompt you again. Wait with the
watcher from `babysit-pr`, so something wakes you when the PR changes. In T3
Code that is `watch_pull_request`. If you stop before the merge, call
`unwatch_pull_request` first.

## Proof

Proof is evidence you observed yourself in this session: command output, a
reproduction, a screenshot. Use the most direct proof the change allows:

- Reproduce the original failure, apply the fix, then watch the same
  reproduction pass.
- Run the checks that the repo's CI runs with `verdict.mjs checks` (step 2).
- Add one focused test that fails without the fix, when the behavior has none
  and the repo has a test setup.
- For UI and runtime behavior, run the app and look at the change. Green mocked
  tests do not prove that the user experience works. Attach screenshots to the
  PR when they help and you have a way to upload them.

When you cannot find a way to prove a change, you do not have full confidence.
Ask the user.

## Merge gate

Full confidence means all of these are true on the latest commit:

- Your proof covers every change in the diff.
- A PASS verdict exists for the current head (`verdict.mjs gate` passes).
- Required checks are green.
- Review bots have finished, and each finding is fixed or dismissed with a
  written reason.
- No human review still requests changes.
- The branch is up to date with the default branch, and GitHub reports it as
  mergeable.

Merge with the method the repo uses. Check the allowed methods and recent merged
PRs. If the repo uses a merge queue or auto-merge, stay until GitHub reports the
PR as merged. Merge through branch protection as configured. Never use `--admin`
or other bypasses. You can ignore automated reviews that request "needs human
review" if you have high confidence in your changes.

## Asking the user

A question in a normal message goes unseen, and the thread looks done. To ask
the user something, use the harness's question tool so the thread shows that
it is waiting: `AskUserQuestion` in Claude Code, `request_user_input` in Codex,
or the question tool your harness has. Put all the context in the question:
the PR link, what blocks you, and the options with your recommendation first.

Ask only when you cannot continue alone:

- You cannot prove the change.
- The merge gate cannot pass, and you cannot fix that yourself.
- The next step is outside the grant above: deleting data, touching production,
  changing things outside the repo, or closing a PR.
- The goal is ambiguous in a way that changes the result.
- Another PR makes this one obsolete.

Decide everything else yourself with sensible defaults, and list those decisions
in the report.

If no question tool is available, or the tool returns no answer, take the safe
path: leave the PR open and unmerged, and start your final message with the
question.
