# Skill wiring

Each skill is a folder under `skills/` that an agent loads by name or reads by path. Wiring breaks when a skill names a script, sibling skill or reference that is not there, or loses the credit its license requires.

## Sub-features

- `frontmatter` gives each `SKILL.md` a `name` equal to its folder and a `description`.
- `paths` makes every script, reference and sibling skill a `SKILL.md` names exist.
- `credits` keeps Warp's MIT notice in each adapted skill.

## How to get to it (user POV)

- dotfiles links each `skills/<name>` folder into `~/.claude/skills` and `~/.agents/skills`. The agent loads `SKILL.md` and runs what it names.

## Driving it

- **Frontmatter.** For each changed `skills/*/SKILL.md`, run `sed -n 1,4p <file>` and record that `name:` equals the folder name.
- **Paths.** For each changed `SKILL.md`, list every `scripts/...`, `references/...` and sibling-skill name it mentions, and run `ls` or `test -e` on each from that skill's folder. Record the output. A missing path is an ISSUES finding.
- **Credits.** For `merge-risk`, `write-pr-description`, `validate-changes-match-specs` and `resolve-merge-conflicts`, run `head -3 skills/<name>/NOTICE` and `grep -c 'MIT' skills/<name>/NOTICE`. Each NOTICE names `warpdotdev/common-skills` and holds the MIT text, and each SKILL.md names Warp in its credits. `merge-risk` also credits Matt Pocock.
- **The flow.** Follow `file-pr`'s body steps on the `sensitive` fixture as far as they run offline: `sensitive-areas`, then `node ~/dotfiles/machine/verdict/verdict.mjs show` from inside the fixture. Record what `show` prints for a commit with no verdict.

## Gotchas

- `validate-changes-match-specs` is read by the verifier through `~/dotfiles/machine/verdict/verify.sh`. Its wiring is checked in dotfiles' own verify skill, not here.
