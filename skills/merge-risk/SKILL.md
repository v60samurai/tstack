---
name: merge-risk
description: Rate the risk of merging a PR as low, medium or high across alignment, impact, verification, rollback cost and error detection. file-pr runs it after the verifier's PASS and puts the result at the top of the PR body. Use when filing a PR or when asked how risky a merge is.
metadata:
  credits:
    - skill: merge-risk
      author: Warp
      url: "https://github.com/warpdotdev/common-skills/blob/main/.agents/skills/merge-risk/SKILL.md"
      license: "MIT, see NOTICE"
    - skill: pr
      author: Matt Pocock
      url: "https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md"
---

# Merge risk

Adapted from Warp's `merge-risk` skill (MIT, see `NOTICE`), which credits Matt Pocock's `pr` skill.

Run it on the PR head after the verifier recorded PASS for that exact commit. The result is the first block of the PR body.

## Gather

1. **The verdict.** `node ~/dotfiles/machine/verdict/verdict.mjs show` prints the record for HEAD (the verdict, its skill and stamp) and `evidence_dir`, the folder `~/.local/state/pr-verdicts/<repo>/<branch>/<sha>.evidence/`. Read `evidence.md` there. This is the Verification input. Do not re-judge it.
2. **The sensitive areas.** Run `scripts/sensitive-areas` next to this file from the repository root. It prints `<area>\t<path>\t<why>` for every changed path that touches auth, permissions, secrets, payments, PII, migrations, dependencies or infra/config, and `none` otherwise.
3. **The change.** Read `git diff origin/<base>...HEAD`, the commit messages and the source issue or spec when there is one.

## Categories

What low risk means for each one:

- **Alignment** (poor ⚠️ / decent 👀 / good ✅). The code does what the description and the source issue say. Behavior assumptions and drive-by changes are written down.
- **Impact** (large ⚠️ / medium 👀 / small ✅). The scope is contained and away from sensitive code. Think about blast radius: consumers that break, layout shift, mobile, other repositories that read this one.
  - Name every area `sensitive-areas` printed, with its paths, as a gap. Add any area you find by reading that the script missed. Never drop one the script printed. If a hit is a false positive, keep it and say why in a few words.
  - Call out anything that widens access, weakens validation, or logs sensitive data. A touched sensitive area makes Impact at least medium.
- **Verification** (poor ⚠️ / decent 👀 / good ✅). Take it from the verdict record and `evidence.md` only.
  - Good: the verdict is PASS for this exact HEAD, stamped by an agent other than the author, and the evidence drives every behavior the change promises.
  - Decent: PASS, but the evidence leaves a promised behavior or an edge case undriven. Name each one.
  - Poor: no verdict for HEAD, a verdict that is not PASS, or a PASS whose evidence does not drive the change. A user-visible change with no screenshot or recording, and a change that could affect performance with no measurement, are poor.
- **Rollback cost** (high ⚠️ / medium 👀 / low ✅). A two-way door is cheap to walk back. Destructive actions, data migrations, published releases and anything other systems start depending on at once are one-way doors.
- **Error detection** (poor ⚠️ / decent 👀 / good ✅ / N/A ✅). If this breaks in production, someone finds out before users report it. Look for swallowed errors and fallbacks that hide breakage.

## Score

Score each verdict ⚠️ = 3, 👀 = 2, ✅ = 1. Weights are Impact 2, Verification 2, Rollback cost 1.5, Error detection 1, Alignment 1. The score is the weighted mean. Below 1.5 is low, 1.5 up to 2.25 is medium, 2.25 and above is high. Keep the numbers and the calculation out of the output.

## Output

```
**Merge risk: <low|medium|high>**

**Alignment:** <verdict>
- <gap, with a file link when it helps>

**Impact:** <verdict>
- Sensitive: <area> (<paths>)

**Verification:** <verdict>
- <gap, from the evidence>

**Rollback cost:** <verdict>

**Error detection:** <verdict>
```

List gaps only. A category with none gets its verdict line alone. Keep each gap to one line.
