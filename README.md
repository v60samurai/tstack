# tstack

The agent skills I use every day, cleaned up so anyone can use them. They work
in Claude Code and Codex. Some use [T3 Code](https://github.com/pingdotgg/t3code)
features when they are available and fall back to native tools when they are
not.

## Skills

| Skill | Say | What it does |
|---|---|---|
| `full-send` | "full send" | Takes a change to a merged PR with nobody watching: proves it with runs, has a second agent verify it, files it, babysits it, merges it. |
| `full-stop` | "full stop" | Same as `full-send`, but stops when the PR is ready for you to merge. |
| `council` | "council" | Gets review from three models from different providers. Runs only when you ask. |
| `file-pr` | "file a PR" | Files a PR whose body opens with its merge risk, then why, decisions, blast radius, verification and where to look first. |
| `takeover` | "take over" | Finishes someone else's PR, branch, or agent thread, and keeps their credit. |
| `babysit-pr` | "babysit" | Watches a PR through CI and review bots, and fixes the real findings. |
| `modernize` | "modernize" | Merges the base into an old PR and decides if it should still exist. |
| `leaving-pr-comments` | (automatic) | Formats comments that an agent posts on your behalf. |
| `merge-risk` | (used by `file-pr`) | Rates a merge low, medium or high, and names every sensitive area it touches. |
| `write-pr-description` | (used by `file-pr`) | Writes a PR body whose every claim is checked against the code or a run. |
| `validate-changes-match-specs` | (used by the verifier) | Drives a branch's PRODUCT.md success criteria and reports each mismatch a run proves. |
| `resolve-merge-conflicts` | (used by `modernize`, `babysit-pr`) | Resolves a base-branch merge from the conflict hunks alone, then proves nothing is left. |

`merge-risk`, `write-pr-description`, `validate-changes-match-specs` and
`resolve-merge-conflicts` are adapted from [Warp's common-skills](https://github.com/warpdotdev/common-skills)
(MIT). Each keeps Warp's license in its `NOTICE` file.

Some skills call others. Install the ones they need too:

- `full-send` uses `file-pr` and `babysit-pr`.
- `full-stop` uses `full-send`.
- `takeover` uses `modernize`, `file-pr`, `babysit-pr`, and `leaving-pr-comments`.
- `file-pr`, `babysit-pr`, and `modernize` use `leaving-pr-comments`.
- `file-pr` uses `merge-risk` and `write-pr-description`.
- `modernize` and `babysit-pr` use `resolve-merge-conflicts`.

## How a change is proven

A change is proven by running it, not by agents reading it. `full-send` runs
the repo's checks on the exact head with `verdict.mjs checks`. For a fix, it
also proves the new test fails on the base with `verdict.mjs regression`. A
fresh agent that did not write the code then runs the repo's `verify-<app>`
skill like a user and records a PASS, ISSUES or BLOCKED verdict for that
commit. A review finding counts only with a failing test, a repro script, or
real command output. Every new commit needs a new verdict, and a branch stops
after three verdicts that are not PASS. Branches are updated by merging the
base in, never by rebasing or force-pushing.

`verdict.mjs` lives in my dotfiles (`~/dotfiles/machine/verdict/`), with the
hook that refuses to open a PR or mark it ready until the head has a PASS
verdict.

## Install

```bash
git clone https://github.com/t3dotgg/tstack
cp -R tstack/skills/* ~/.claude/skills/   # Claude Code
cp -R tstack/skills/* ~/.codex/skills/    # Codex
```

## Requirements

- An authenticated [GitHub CLI](https://cli.github.com) (`gh`).
- `python3` for `babysit-pr`'s `pr-wait` script.
- `council` needs subagents on other providers' models. T3 Code
  does this with `delegate_task`. Otherwise you need a harness that can run
  those models.

## Make them yours

These are starting points. Edit them. Put personal settings, like which models
sit on your council, in your `CLAUDE.md` or `AGENTS.md`, so you can update the
skills without losing them.

## License

[MIT](LICENSE)
