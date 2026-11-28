---
name: write-pr-description
description: Write the body of a pull request for file-pr. It says why the change exists, the decisions that had a real alternative, the blast radius, what was verified and how, and where to look first, with every claim checked against the code or a run. Use when file-pr writes or refreshes a PR body, or when a body no longer matches its branch.
metadata:
  credits:
    - skill: write-pr-description
      author: Warp
      url: "https://github.com/warpdotdev/common-skills/blob/main/.agents/skills/write-pr-description/SKILL.md"
      license: "MIT, see NOTICE"
---

# Write a PR description

Adapted from Warp's `write-pr-description` skill (MIT, see `NOTICE`).

A PR body gives the reviewer what the diff cannot: why the change exists, what it can break, which choices had a real alternative, and what was proven. `file-pr` files the PR and owns the title and the footer lines. This skill owns the body between them.

## 1. Collect and check the facts

```bash
git --no-pager log origin/<base>..HEAD        # commit bodies first, they carry the why
git --no-pager diff origin/<base>...HEAD --stat
node ~/dotfiles/machine/verdict/verdict.mjs show   # the verdict, checks and regression for HEAD
```

Every factual claim in the body is checked before it goes in, against the code or a run. A commit message saying "matches the pattern in this file" is a claim about code, and often wrong. Check by looking, not by reasoning:

- Read what the change deletes. A fixed defect is usually visible in the removed code.
- Ask the system what a thing means: the CLI's `--help`, the schema, the parser, the provider's role definition.
- Grep a flag across the environment files before saying it is on or off.
- Open the file a comment or commit points at and confirm it says what the pointer claims.

A claim you cannot check stays out, or goes in labelled as an expectation. Never write intent as a result.

## 2. Keep the repository's template

Look for `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/*.md`, `docs/pull_request_template.md` and `pull_request_template.md`. Pick the one that matches the change. The template's own instructions outrank this skill.

- Keep its headings, their wording and their order. Answer every section in your own words under its heading. Do not copy its question text or examples.
- Where a section does not apply, say so in a clause that shows you considered it ("No new tables").
- Tick a box only when its statement is true. Otherwise leave it unticked with a short reason on the same line.
- Keep machine-read content: changelog markers, issue-linking keys, media markers.

The merge-risk block still goes first, above the template's first heading.

## 3. The body

In this order. Drop any section that would hold one line, and let the opening carry it.

1. **Merge risk.** The output of the `merge-risk` skill, unchanged.
2. **Why.** One to three sentences on the problem and what the change does about it, in the user's terms. A reviewer who reads only this paragraph can tell whether the PR is theirs.
3. **Decisions.** Each choice that had a real alternative, and why the alternative lost. This is the content the diff can never recover. Where there was no real alternative, state the decision plainly and do not invent one.
4. **Blast radius.** What this can break beyond the files it touches: callers, consumers, other repositories, data, permissions. For a permissions change, say what is now allowed that was not, and what is now refused that was allowed. Name behavior changes that are side effects of the main change.
5. **Verification.** The output of `verdict.mjs body`, unedited. It brings its own `## Verification` heading, so do not write another. It carries the verified commit, the verdict, the verify evidence, the check results and the followups. When something was not run, the merge-risk Verification gaps already say so. Do not repeat them.
6. **Look here first.** The one to three places where a mistake is most likely or most expensive, with file links, and what you are unsure of. On a large PR, add a reading order. See [references/review-guide.md](references/review-guide.md).

Followups live outside git, next to the verdict record. `verdict.mjs body` copies them into the Verification section. Do not move them anywhere else and do not fix them in this PR.

## 4. Prose

Plain English, active voice, one idea per sentence, sentences under about 25 words, one term per concept. Code identifiers and commands stay as they are. See [references/plain-language.md](references/plain-language.md).

## 5. Cut

Name the decision each paragraph helps the reviewer make. Delete the paragraph if you cannot. The usual finds:

- Anything the diff shows at a glance: a file-by-file inventory, a rename, a restated lockfile.
- Lists of the tests you added. Say what is not covered instead.
- How standard tools behave. Explain this change, not the reviewer's tools.
- The second statement of a fact, and sentences that only point at another part of the body.
- History of the branch ("this previously did X, then review asked for Y"). The reviewer sees one state against the base. Describe that state, and keep the reasoning without the transition.
- Grading your own work ("robust", "comprehensive", "clean") and lecturing the reviewer.
- Commit trailers. They belong in the commit.

Rough lengths: a mechanical change is a short paragraph, a focused fix or feature is four or five hundred words, a new mechanism with consumers stays under a thousand. When something must go, cut mechanism before a decision.

## 6. Self-check

- Does every claim trace to code you read or a run you can name?
- Does the Verification section describe what ran, and say plainly what did not?
- Is the merge-risk block first, and the `verdict.mjs body` output present, unedited, and the only `## Verification` heading?
- Does the body match the branch as it stands now?
- Did cutting remove a decision, a rejected alternative or an open question? Put it back.
