---
name: verify-tstack
description: Drive tstack's PR skills the way an agent uses them, through their scripts and the commands their SKILL.md files tell an agent to run, against throwaway git repositories. Use when verifying a tstack commit, before filing a tstack PR.
---

# verify-tstack

tstack is a set of agent skills (`skills/<name>/SKILL.md`) plus a few scripts they call. Its user is an agent following a skill. Verifying a change means running what the changed skill tells that agent to run, on a throwaway repository, and watching the result. Reading a SKILL.md alone proves nothing.

## Launch

Nothing to start. You need `python3`, `git`, `node` and `gh` on PATH. Make one scratch folder for the run and keep everything in it:

```bash
cd <tstack checkout>
run=$(mktemp -d "${TMPDIR:-/tmp}/verify-tstack.XXXX")
```

Throwaway repositories come from `.agents/skills/verify-tstack/fixtures.sh`:

```bash
sh .agents/skills/verify-tstack/fixtures.sh sensitive "$run/sensitive"   # a feat branch touching sensitive areas
sh .agents/skills/verify-tstack/fixtures.sh conflict "$run/conflict"     # a feat branch mid-merge, stopped on a conflict
```

Each prints the repository path. Neither has a remote and neither runs hooks.

## Doctor

```bash
python3 --version && git --version && node --version && gh auth status 2>&1 | grep -m1 'Logged in'
python3 -I test/test_scripts.py
```

Both must succeed before you drive anything. A failing unit test is an ISSUES finding on its own: record the test name and output.

## Drive

`features/README.md` maps each feature to its journeys. Drive every feature the change touches, and the sibling skills it names. Run each command from the tstack checkout unless the journey says otherwise.

## Evidence

Write `evidence.md` in the folder `verify.sh` names. For each journey: the exact command, its real output trimmed to the lines that prove the point, and the observable end state. A journey that changes a repository also records `git -C <repo> status --short` after it. Copy any output file you cite into the evidence folder.

Proof standards: run the script or command the skill names, not an internal function. Capture the action and the resulting state. For `pr-wait`, observe a real PR read-only and never pass a PR you would mind it touching (it only reads).

## Cleanup

```bash
rm -rf "$run"
```

This removes the throwaway repositories only. The evidence folder stays.
