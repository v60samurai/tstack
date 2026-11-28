---
name: file-pr
description: File a concise pull request. Use when the user asks to file, open, or create a PR.
---

# File PR

Before filing, check whether a PR for this branch already exists. Review the
diff locally against the base branch (usually `origin/main`) to make sure its
contents match the goal.

PR titles usually become commit messages, so follow the repository's title
conventions. Look at recently merged PRs and Git history for examples. Prefer a
concise, human-readable title that explains why the change matters:

BAD

> ❌ perf(server): negotiate permessage-deflate on the websocket

GOOD

> ✅ perf(server): cut websocket frame size by 70%+ with gzipping

File only after the verifier recorded PASS for the exact HEAD (full-send
steps 2 and 3). Then write the body:

1. Run the `merge-risk` skill on the head. Its block opens the body.
2. Write the rest with the `write-pr-description` skill: why the change
   exists, the decisions that had a real alternative, the blast radius, what
   was verified and how, and where to look first. Check every claim against
   the code or a run before it goes in. Keep the repository's PR template when
   it has one.
3. Put the output of `node ~/dotfiles/machine/verdict/verdict.mjs body`, run
   on the head, in the Verification section unedited. It carries the verify
   evidence, the check results, the followups and the verified commit hash.

End the description with the public model name and harness that made the
changes, for example `Created with <model> in <harness>.` Include subagent
models that wrote part of the change. Use the model name the harness reports.
If model identity is unavailable, name the harness without guessing a model.

Footer lines go in this order, each only when it applies: the proof line
(`full-send`), the model line, then the harness's own attribution line if the
harness requires one.

Before submission, check the title, description, quotes, and attachments for
secrets and private details.

Open a real PR rather than a draft so review bots run, unless the user or the
repository asks for a draft. A hook refuses
`gh pr create` and its REST equivalent until `verdict.mjs gate` passes for the
head. If `gh pr create` fails
because the GraphQL rate limit is used up, open it through REST with
`gh api repos/<owner>/<repo>/pulls -f title=... -f head=... -f base=... -F body=@<file>`. If the user also asked
to babysit it, continue with the `babysit-pr` skill.

Do not post a follow-up PR comment unless it serves the user's request. When a
comment is needed, use the `leaving-pr-comments` skill.
