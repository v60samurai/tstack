#!/usr/bin/env node
// review-gate: the one place the pre-PR review loop's limits live. Skills call it; the push guard reads its approvals.
// The ledger is one JSON file per branch under the repository's git directory, so it is never committed.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SEVERITIES = ["blocker", "should", "nit"];
const LABELS = ["introduced", "pre-existing"];
const RISKS = ["security", "auth", "data-loss", "concurrency"];
const REVIEWER = { claude: "gpt-sol (codex exec, AI-Dev account)", codex: "claude-opus" };
const STATE = process.env.REVIEW_GATE_STATE || path.join(homedir(), ".local", "state", "review-gate");
const HEAVY_GUARD = process.env.REVIEW_GATE_HEAVY_GUARD ?? path.join(homedir(), "dotfiles", "claude", "hooks", "heavy-run-guard.sh");

class GateError extends Error {}
const fail = (msg) => { throw new GateError(msg); };

const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const tryGit = (args) => { try { return git(args); } catch { return null; } };

function repo() {
  const root = tryGit(["rev-parse", "--show-toplevel"]) ?? fail("Not inside a git repository.");
  const branch = tryGit(["symbolic-ref", "--short", "HEAD"]) ?? fail("HEAD is detached. Check out the change's branch first.");
  const gitDir = path.resolve(root, git(["rev-parse", "--git-common-dir"], { cwd: root }));
  const file = path.join(gitDir, "review-gate", branch.replaceAll("/", "__") + ".json");
  return { root, branch, file };
}

function config(root) {
  const file = path.join(root, ".review-gate.json");
  if (!existsSync(file)) fail(`${file} is missing. It names the checks and the risky paths: {"checks": ["<typecheck>", "<tests the change reaches>"], "risky": ["<glob>"], "autoApprove": false}. Ask Harshit before choosing the commands.`);
  const c = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(c.checks) || c.checks.length === 0) fail(".review-gate.json needs a non-empty \"checks\" list.");
  return { checks: c.checks, risky: c.risky ?? [], autoApprove: c.autoApprove === true };
}

const load = (r) => existsSync(r.file) ? JSON.parse(readFileSync(r.file, "utf8")) : fail("No ledger for this branch. Run `review-gate init` first.");
const save = (r, l) => { mkdirSync(path.dirname(r.file), { recursive: true }); writeFileSync(r.file, JSON.stringify(l, null, 2) + "\n"); };
const head = (root) => git(["rev-parse", "HEAD"], { cwd: root });
const clean = (root) => git(["status", "--porcelain"], { cwd: root }) === "" || fail("The working tree has uncommitted or untracked changes. Commit them, or move unrelated files out, then rerun.");
const allFindings = (l) => l.rounds.flatMap((rd) => rd.findings);
const openBlockers = (l) => allFindings(l).filter((f) => f.severity === "blocker" && !f.outcome);

function changedFiles(root, from, to = "HEAD") {
  const out = git(["diff", "--name-only", `${from}..${to}`], { cwd: root });
  return out ? out.split("\n") : [];
}

function riskyPaths(root, l, cfg) {
  return changedFiles(root, l.base).filter((f) => cfg.risky.some((g) => path.matchesGlob(f, g)));
}

function detectAuthor(root, base) {
  const log = git(["log", "--format=%B%n%an <%ae>", `${base}..HEAD`], { cwd: root });
  const claude = /co-authored-by:\s*claude|noreply@anthropic\.com/i.test(log);
  const codex = /co-authored-by:\s*codex|\bcodex\b.*noreply|openai\.com/i.test(log);
  return claude && !codex ? "claude" : codex && !claude ? "codex" : null;
}

function run(cmd, cwd, logFile) {
  if (HEAVY_GUARD && existsSync(HEAVY_GUARD)) {
    const g = spawnSync("sh", [HEAVY_GUARD], { input: JSON.stringify({ tool_input: { command: cmd } }), encoding: "utf8" });
    if (g.stdout.trim()) fail(`Another heavy run is live, so this one waits: ${JSON.parse(g.stdout).hookSpecificOutput.permissionDecisionReason}`);
  }
  const p = spawnSync("sh", ["-c", cmd], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (logFile) writeFileSync(logFile, `$ ${cmd}\n${p.stdout}${p.stderr}\nexit ${p.status}\n`, { flag: "a" });
  return p.status ?? 1;
}

function flag(args, name, { required = false, choices } = {}) {
  const i = args.indexOf(`--${name}`);
  const v = i >= 0 ? args[i + 1] : undefined;
  if (v === undefined && required) fail(`--${name} is required.`);
  if (v !== undefined && choices && !choices.includes(v)) fail(`--${name} must be one of ${choices.join(", ")}.`);
  return v;
}

// Commands

function init(args) {
  const r = repo();
  const defaultBranch = (tryGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]) ?? "origin/main");
  const baseRef = flag(args, "base") ?? defaultBranch;
  const base = git(["merge-base", "HEAD", baseRef], { cwd: r.root });
  const author = flag(args, "author", { choices: Object.keys(REVIEWER) }) ?? detectAuthor(r.root, base)
    ?? fail("Could not tell from the commit trailers which model wrote this change. Rerun with --author claude or --author codex.");
  if (existsSync(r.file) && !args.includes("--reset")) fail(`A ledger already exists for ${r.branch}. Use it, or pass --reset to start over.`);
  config(r.root);
  save(r, { branch: r.branch, base, baseRef, author, reviewer: REVIEWER[author], checks: null, rounds: [], escalated: null, approved: null });
  return `Ledger for ${r.branch}. Base ${base.slice(0, 12)}. Written by ${author}, so the reviewer is ${REVIEWER[author]}.`;
}

function check() {
  const r = repo(); const l = load(r); const cfg = config(r.root);
  clean(r.root);
  const sha = head(r.root);
  const logFile = path.join(path.dirname(r.file), `${r.branch.replaceAll("/", "__")}-${sha.slice(0, 12)}.log`);
  writeFileSync(logFile, "");
  const results = cfg.checks.map((cmd) => ({ cmd, exit: run(cmd, r.root, logFile) }));
  const changed = git(["status", "--porcelain"], { cwd: r.root });
  l.checks = { sha, ok: results.every((x) => x.exit === 0) && changed === "", results, log: logFile };
  save(r, l);
  const lines = results.map((x) => `${x.exit === 0 ? "pass" : "FAIL"} (exit ${x.exit}) ${x.cmd}`);
  if (changed) fail(`${lines.join("\n")}\nA check changed files, so ${sha.slice(0, 12)} is not what was tested:\n${changed}\nCommit or discard those changes, then rerun. Log: ${logFile}`);
  if (!l.checks.ok) fail(`${lines.join("\n")}\nChecks failed on ${sha.slice(0, 12)}. Fix them before review. Log: ${logFile}`);
  return `${lines.join("\n")}\nChecks passed on ${sha.slice(0, 12)}. Log: ${logFile}`;
}

function roundStart() {
  const r = repo(); const l = load(r); const cfg = config(r.root);
  const sha = head(r.root);
  if (l.escalated) fail(`Escalated to Harshit: ${l.escalated}. No more rounds.`);
  if (l.rounds.some((x) => !x.ended)) fail("A round is still open. End it with `review-gate round end` first.");
  if (!l.checks || l.checks.sha !== sha || !l.checks.ok) fail(`Checks have not passed on HEAD ${sha.slice(0, 12)}. Run \`review-gate check\` first.`);
  const n = l.rounds.length + 1;
  if (n > 2) fail("The loop is over: two rounds ran. Fix or decline the open blockers, then `review-gate verify`. There is no round 3.");
  let from = l.base;
  if (n === 2) {
    const first = l.rounds[0];
    if (openBlockers(l).length) fail(`Round 1 left blockers open: ${openBlockers(l).map((f) => f.id).join(", ")}. Fix each with a test or decline it first.`);
    if (!first.findings.some((f) => f.outcome === "fixed")) fail("Round 2 reviews fixes only, and round 1 fixed no blocker. Run `review-gate verify`.");
    if (first.to === sha) fail("No commits since round 1.");
    const risky = riskyPaths(r.root, l, cfg);
    const flagged = first.findings.filter((f) => f.risk).map((f) => `${f.id} (${f.risk})`);
    if (risky.length || flagged.length) {
      l.escalated = `this change is risky (${[...risky, ...flagged].join(", ")}), so it goes to Harshit instead of round 2`;
      save(r, l);
      fail(`Escalated to Harshit: ${l.escalated}. Show him round 1's findings and the fix commits, then stop.`);
    }
    from = first.to;
  }
  l.rounds.push({ n, from, to: sha, reviewer: l.reviewer, findings: [], ended: null });
  save(r, l);
  return [
    `Round ${n} of at most 2. Reviewer: ${l.reviewer}.`,
    `Review: git diff ${from}..${sha}${n === 2 ? `  (context only: git diff ${l.base}..${from})` : ""}`,
    "Record each finding with `review-gate finding add`, then `review-gate round end --read \"<what the reviewer read and why the change holds>\"`.",
  ].join("\n");
}

function roundEnd(args) {
  const r = repo(); const l = load(r);
  const rd = l.rounds.at(-1);
  if (!rd || rd.ended) fail("No open round.");
  const read = flag(args, "read", { required: true });
  if (read.trim().length < 40) fail("--read must say what the reviewer read and why the change holds. A bare \"looks good\" is a failed round: rerun it.");
  rd.ended = { at: new Date().toISOString(), read };
  save(r, l);
  const blockers = rd.findings.filter((f) => f.severity === "blocker");
  return blockers.length
    ? `Round ${rd.n} ended with ${blockers.length} blocker(s): ${blockers.map((f) => f.id).join(", ")}. Fix each with \`finding fix\` or decline it with \`finding decline\`.`
    : `Round ${rd.n} ended with no blockers. Run \`review-gate verify\`.`;
}

function findingAdd(args) {
  const r = repo(); const l = load(r);
  const rd = l.rounds.at(-1);
  if (!rd || rd.ended) fail("Findings go into an open round. Run `review-gate round start` first.");
  const severity = flag(args, "sev", { required: true, choices: SEVERITIES });
  const f = {
    id: `R${rd.n}-${rd.findings.length + 1}`,
    severity,
    label: flag(args, "label", { required: true, choices: LABELS }),
    risk: flag(args, "risk", { choices: RISKS }) ?? null,
    file: flag(args, "file", { required: true }),
    claim: flag(args, "claim", { required: true }),
    outcome: severity === "blocker" ? null : "followup",
  };
  rd.findings.push(f);
  if (f.risk && severity === "blocker") l.escalated = `${f.id} is a ${f.risk} blocker`;
  save(r, l);
  if (f.outcome === "followup") return `${f.id} is a ${severity}. It goes to follow-ups and gets no fix in this loop.`;
  return f.risk ? `${f.id} is a ${f.risk} blocker, so the change is escalated to Harshit. Show him the finding and stop.` : `${f.id} recorded as a blocker.`;
}

function findingFix(args) {
  const r = repo(); const l = load(r);
  const id = args[0] ?? fail("Name the finding: `review-gate finding fix <id> --files <test files> --cmd <test command>`.");
  const rd = l.rounds.find((x) => x.findings.some((f) => f.id === id)) ?? fail(`No finding ${id}.`);
  const f = rd.findings.find((x) => x.id === id);
  if (f.severity !== "blocker") fail(`${id} is a ${f.severity}. Only blockers get fixed in this loop; it stays a follow-up.`);
  if (f.outcome) fail(`${id} is already ${f.outcome}.`);
  const files = flag(args, "files", { required: true }).split(",").map((s) => s.trim()).filter(Boolean);
  const cmd = flag(args, "cmd", { required: true });
  clean(r.root);
  const sha = head(r.root);
  if (sha === rd.to) fail(`Commit the fix and its test first. HEAD is still the reviewed commit ${sha.slice(0, 12)}.`);
  for (const t of files) if (tryGit(["cat-file", "-e", `HEAD:${t}`]) === null) fail(`${t} is not in HEAD. Commit the test first.`);
  // Put every non-test file back to the reviewed commit, keep the new test, and expect it to fail.
  // With --stale-test the tests go back too: the reviewed commit's own test must fail, and the updated one pass.
  const stale = args.includes("--stale-test");
  if (stale) for (const t of files) if (tryGit(["cat-file", "-e", `${rd.to}:${t}`]) === null) fail(`${t} is not in the reviewed commit, so it is a new test, not a stale one. Drop --stale-test.`);
  const revert = changedFiles(r.root, rd.to).filter((p) => stale || !files.includes(p));
  let before;
  try {
    for (const p of revert) {
      if (tryGit(["cat-file", "-e", `${rd.to}:${p}`]) !== null) git(["checkout", rd.to, "--", p], { cwd: r.root });
      else git(["rm", "-q", "--", p], { cwd: r.root });
    }
    before = run(cmd, r.root);
  } finally {
    git(["reset", "-q", "--hard", sha], { cwd: r.root });
  }
  if (before === 0 && stale) fail(`The reviewed commit's own test passes (on ${rd.to.slice(0, 12)}), so it was not stale and does not prove ${id}.`);
  if (before === 0) fail(`The test passes without the fix (on ${rd.to.slice(0, 12)} plus the test), so it does not prove ${id}. The finding may be false: revert the fix, or write a test that fails without it.`);
  const after = run(cmd, r.root);
  if (after !== 0) fail(`The test fails on HEAD (exit ${after}), so the fix does not work yet.`);
  f.outcome = "fixed";
  f.fix = { commit: sha, tests: files, cmd, before, after, stale };
  save(r, l);
  return `${id} fixed in ${sha.slice(0, 12)}. The test failed without the fix (exit ${before}) and passes with it.`;
}

function findingDecline(args) {
  const r = repo(); const l = load(r);
  const id = args[0] ?? fail("Name the finding: `review-gate finding decline <id> --reason <why> --kind <slug>`.");
  const f = allFindings(l).find((x) => x.id === id) ?? fail(`No finding ${id}.`);
  if (f.outcome === "fixed") fail(`${id} is already fixed.`);
  const kind = flag(args, "kind", { required: true });
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(kind)) fail("--kind is a short kebab-case slug for the kind of finding, such as missing-null-guard, so repeats can be counted.");
  f.outcome = "declined";
  f.decline = { reason: flag(args, "reason", { required: true }), kind, by: flag(args, "by", { choices: ["harshit", "agent"] }) ?? "agent", at: new Date().toISOString() };
  save(r, l);
  return `${id} declined (${kind}, by ${f.decline.by}).`;
}

function samePatch(root, a, b, c, d) {
  const id = (from, to) => spawnSync("git", ["patch-id", "--stable"], { cwd: root, encoding: "utf8", input: git(["diff", `${from}..${to}`], { cwd: root }) }).stdout.split(" ")[0];
  const x = id(a, b);
  return Boolean(x) && x === id(c, d);
}

function verify() {
  const r = repo(); const l = load(r);
  const sha = head(r.root);
  const why = [];
  if (l.escalated) why.push(`escalated to Harshit: ${l.escalated}. File only on his word, with SOL_LOOP=waived`);
  if (!l.checks || l.checks.sha !== sha || !l.checks.ok) why.push(`checks have not passed on HEAD ${sha.slice(0, 12)}`);
  if (!l.rounds.length) why.push("no review round has run");
  if (l.rounds.some((x) => !x.ended)) why.push("a round is still open");
  if (openBlockers(l).length) why.push(`blockers still open: ${openBlockers(l).map((f) => f.id).join(", ")}`);
  const last = l.rounds.at(-1);
  let rebasedOnto = null;
  if (last && l.rounds.length === 1 && last.to !== sha) {
    const fixed = last.findings.some((f) => f.outcome === "fixed");
    const newBase = tryGit(["merge-base", "HEAD", l.baseRef ?? l.base]);
    if (!fixed && newBase && newBase !== l.base && samePatch(r.root, l.base, last.to, newBase, sha)) rebasedOnto = newBase;
    else why.push(fixed
      ? "round 1's fixes have not been reviewed. Run round 2 on the fix commits"
      : "HEAD moved after round 1 and is not a plain rebase of the reviewed change. Commits after review need round 2");
  }
  for (const f of allFindings(l).filter((x) => x.outcome === "fixed")) {
    const exit = run(f.fix.cmd, r.root);
    if (exit !== 0) why.push(`${f.id}'s fix test fails on HEAD (exit ${exit}): ${f.fix.cmd}`);
  }
  if (why.length) fail(`Not approved:\n- ${why.join("\n- ")}`);
  if (rebasedOnto) l.base = rebasedOnto;
  l.approved = { sha, at: new Date().toISOString(), rounds: l.rounds.length, rebasedOnto };
  save(r, l);
  mkdirSync(path.join(STATE, "approved"), { recursive: true });
  writeFileSync(path.join(STATE, "approved", sha), JSON.stringify({ repo: r.root, branch: r.branch, rounds: l.rounds.length }) + "\n");
  return `Approved ${sha} after ${l.rounds.length} round(s). File with REVIEW_GATE=${sha} in front of the create command.`;
}

function status(args) {
  const r = repo(); const l = load(r);
  if (!args.includes("--md")) return JSON.stringify(l, null, 2);
  const follow = allFindings(l).filter((f) => f.outcome === "followup" || f.outcome === "declined");
  const tail = l.checks?.log && existsSync(l.checks.log) ? readFileSync(l.checks.log, "utf8").split("\n").slice(-15).join("\n") : "";
  return [
    "### Review",
    l.approved ? `Reviewed by ${l.reviewer}, ${l.approved.rounds} round(s). Approved commit \`${l.approved.sha}\`.` : "Not approved yet.",
    ...allFindings(l).filter((f) => f.outcome === "fixed").map((f) => `- Fixed ${f.id}: ${f.claim} (test: ${f.fix.tests.join(", ")})`),
    "",
    "### Checks",
    ...(l.checks?.results ?? []).map((x) => `- \`${x.cmd}\` exit ${x.exit} on \`${l.checks.sha.slice(0, 12)}\``),
    tail ? "\n<details><summary>Check output (last lines)</summary>\n\n```\n" + tail + "\n```\n</details>" : "",
    "",
    "### Follow-ups",
    ...(follow.length ? follow.map((f) => `- [${f.severity}, ${f.label}] \`${f.file}\`: ${f.claim}${f.decline ? ` Declined: ${f.decline.reason}` : ""}`) : ["None."]),
  ].join("\n");
}

function* ledgers(roots) {
  for (const root of roots) {
    let entries = [];
    try { entries = readdirSync(root); } catch { continue; }
    for (const e of entries) {
      const dir = path.join(root, e, ".git", "review-gate");
      try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) yield { repo: path.join(root, e), ledger: JSON.parse(readFileSync(path.join(dir, f), "utf8")) };
    }
  }
}

function learn(args) {
  const days = Number(flag(args, "days") ?? 7);
  const roots = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--days");
  const since = Date.now() - days * 864e5;
  const byKind = new Map();
  for (const { repo: rp, ledger } of ledgers(roots.length ? roots : ["work", "work/apps", "personal", "src"].map((d) => path.join(homedir(), d)))) {
    for (const f of allFindings(ledger)) {
      if (f.outcome !== "declined" || f.decline.by !== "harshit") continue;
      const key = `${rp}\t${f.decline.kind}`;
      byKind.set(key, [...(byKind.get(key) ?? []), { ...f, branch: ledger.branch }]);
    }
  }
  const rules = [...byKind].filter(([, fs]) => fs.length >= 2 && fs.some((f) => Date.parse(f.decline.at) >= since));
  if (!rules.length) return "No finding kind was declined by Harshit twice. Nothing to learn.";
  return rules.map(([key, fs]) => {
    const [rp, kind] = key.split("\t");
    return `${rp}: add to AGENTS.md "## Code Review Rules": Do not flag ${kind}. Harshit declined it ${fs.length} times: ${fs.map((f) => `"${f.decline.reason}"`).join("; ")}.`;
  }).join("\n");
}

const CODEX_BOT = "chatgpt-codex-connector[bot]";
function gh(p) { return JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", p], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })).flat(); }

export function riskVerdict({ pr, files, runs, statuses, reviews, comments, risky }) {
  const sha = pr.head.sha;
  const codex = reviews.filter((v) => v.user.login === CODEX_BOT && v.commit_id === sha);
  const codexFindings = comments.filter((c) => c.user.login === CODEX_BOT && codex.some((v) => v.id === c.pull_request_review_id));
  const why = [];
  const hit = files.filter((f) => risky.some((g) => path.matchesGlob(f, g)));
  if (hit.length) why.push(`touches risky paths: ${hit.join(", ")}`);
  const bad = runs.filter((x) => x.status !== "completed" || !["success", "skipped", "neutral"].includes(x.conclusion));
  const badStatus = statuses.filter((x) => x.state !== "success");
  if (!runs.length && !statuses.length) why.push("no checks ran on the head commit");
  if (bad.length) why.push(`checks not green: ${bad.map((x) => `${x.name}=${x.conclusion ?? x.status}`).join(", ")}`);
  if (badStatus.length) why.push(`statuses not green: ${badStatus.map((x) => `${x.context}=${x.state}`).join(", ")}`);
  if (!codex.length) why.push(`no Codex review of the head commit ${sha.slice(0, 12)}`);
  if (codexFindings.length) why.push(`Codex left ${codexFindings.length} finding(s) on the head commit`);
  // shortcut: a later approval does not clear an earlier change request, so this errs toward asking Harshit; read each reviewer's latest state when that gets noisy.
  if (reviews.some((v) => v.state === "CHANGES_REQUESTED")) why.push("a reviewer requested changes");
  if (pr.mergeable_state && !["clean", "has_hooks"].includes(pr.mergeable_state)) why.push(`mergeable state is ${pr.mergeable_state}`);
  return { verdict: why.length ? "NEEDS-HARSHIT" : "AUTO-APPROVE", why, sha };
}

function risk(args) {
  const r = repo(); const cfg = config(r.root);
  const n = flag(args, "pr", { required: true });
  const slug = flag(args, "repo") ?? execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], { cwd: r.root, encoding: "utf8" }).trim();
  const [pr] = gh(`repos/${slug}/pulls/${n}`);
  const { verdict, why, sha } = riskVerdict({
    pr,
    files: gh(`repos/${slug}/pulls/${n}/files`).map((f) => f.filename),
    runs: gh(`repos/${slug}/commits/${pr.head.sha}/check-runs`).flatMap((x) => x.check_runs ?? []),
    statuses: gh(`repos/${slug}/commits/${pr.head.sha}/status`).flatMap((x) => x.statuses ?? []),
    reviews: gh(`repos/${slug}/pulls/${n}/reviews`),
    comments: gh(`repos/${slug}/pulls/${n}/comments`),
    risky: cfg.risky,
  });
  const mode = cfg.autoApprove ? "on" : "off (report only; merges stay with Harshit)";
  return `${verdict} #${n} at ${sha.slice(0, 12)}. Risk gate: ${mode}.${why.length ? "\n- " + why.join("\n- ") : ""}`;
}

const COMMANDS = {
  init, check, verify, status, learn, risk,
  round: (a) => ({ start: roundStart, end: roundEnd })[a[0]]?.(a.slice(1)) ?? fail("round start | round end --read <text>"),
  finding: (a) => ({ add: findingAdd, fix: findingFix, decline: findingDecline })[a[0]]?.(a.slice(1)) ?? fail("finding add | finding fix <id> | finding decline <id>"),
};

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    const fn = COMMANDS[cmd] ?? fail(`Usage: review-gate <${Object.keys(COMMANDS).join("|")}> ...`);
    console.log(fn(rest));
  } catch (e) {
    console.error(e instanceof GateError ? e.message : e.stack);
    process.exit(e instanceof GateError ? 1 : 2);
  }
}
