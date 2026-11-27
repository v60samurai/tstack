import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const GATE = path.join(import.meta.dirname, "review-gate.mjs");

function sandbox({ risky = [] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "review-gate-"));
  const state = mkdtempSync(path.join(tmpdir(), "review-gate-state-"));
  const sh = (cmd) => execFileSync("sh", ["-c", cmd], { cwd: dir, encoding: "utf8" });
  const gate = (...args) => {
    const p = spawnSync("node", [GATE, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, REVIEW_GATE_STATE: state, REVIEW_GATE_HEAVY_GUARD: "" } });
    return { code: p.status, out: (p.stdout + p.stderr).trim() };
  };
  const commit = (msg) => sh(`git add -A && git commit -qm "${msg}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`);
  sh("git init -q -b main && git config user.email t@t && git config user.name t");
  writeFileSync(path.join(dir, ".review-gate.json"), JSON.stringify({ checks: ["sh check.sh"], risky }));
  writeFileSync(path.join(dir, "check.sh"), "exit 0\n");
  writeFileSync(path.join(dir, "app.sh"), "echo 1\n");
  sh("git add -A && git commit -qm base && git checkout -qb feat");
  writeFileSync(path.join(dir, "app.sh"), "echo 2\n");
  commit("feat: change");
  return { dir, state, sh, gate, commit };
}

const ok = (r, re) => { assert.equal(r.code, 0, r.out); if (re) assert.match(r.out, re); };
const no = (r, re) => { assert.equal(r.code, 1, r.out); assert.match(r.out, re); };

test("a clean first round approves the exact head and records it for the push guard", () => {
  const s = sandbox();
  ok(s.gate("init", "--base", "main"), /reviewer is gpt-sol/);
  no(s.gate("round", "start"), /Checks have not passed/);
  ok(s.gate("check"), /Checks passed/);
  ok(s.gate("round", "start"), /Round 1 of at most 2/);
  ok(s.gate("finding", "add", "--sev", "should", "--label", "introduced", "--file", "app.sh", "--claim", "prints the wrong thing on Sundays"), /follow-ups/);
  no(s.gate("round", "end", "--read", "lgtm"), /failed round/);
  ok(s.gate("round", "end", "--read", "Read app.sh and check.sh; the only change swaps the printed value and nothing calls it."));
  const v = s.gate("verify");
  ok(v, /Approved/);
  const sha = s.sh("git rev-parse HEAD").trim();
  assert.ok(existsSync(path.join(s.state, "approved", sha)), "approval file is keyed by the head SHA");
  ok(s.gate("status", "--md"), /Follow-ups[\s\S]*Sundays/);
});

test("checks must pass on a clean tree, and a later commit invalidates them", () => {
  const s = sandbox();
  ok(s.gate("init", "--base", "main"));
  writeFileSync(path.join(s.dir, "stray.txt"), "x");
  no(s.gate("check"), /uncommitted or untracked/);
  s.sh("rm stray.txt");
  writeFileSync(path.join(s.dir, "check.sh"), "exit 3\n");
  s.commit("break checks");
  no(s.gate("check"), /FAIL \(exit 3\)/);
});

test("a blocker is fixed only by a test that fails without the fix, and the loop stops after round 2", () => {
  const s = sandbox();
  ok(s.gate("init", "--base", "main"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("finding", "add", "--sev", "blocker", "--label", "introduced", "--file", "app.sh", "--claim", "prints 2, callers expect 3"));
  ok(s.gate("round", "end", "--read", "Read app.sh and its only caller; the caller parses the output and expects 3."));
  no(s.gate("finding", "fix", "R1-1", "--files", "t.sh", "--cmd", "sh t.sh"), /Commit the fix/);
  no(s.gate("verify"), /blockers still open: R1-1/);

  writeFileSync(path.join(s.dir, "t.sh"), "exit 0\n");
  s.commit("test that proves nothing");
  no(s.gate("finding", "fix", "R1-1", "--files", "t.sh", "--cmd", "sh t.sh"), /passes without the fix/);

  writeFileSync(path.join(s.dir, "t.sh"), "[ \"$(sh app.sh)\" = 3 ]\n");
  writeFileSync(path.join(s.dir, "app.sh"), "echo 3\n");
  s.commit("fix: print 3");
  ok(s.gate("finding", "fix", "R1-1", "--files", "t.sh", "--cmd", "sh t.sh"), /failed without the fix/);
  assert.equal(s.sh("cat app.sh"), "echo 3\n", "the fix is back in the tree after the check");
  assert.equal(s.sh("git status --porcelain"), "", "the check leaves the tree clean");

  no(s.gate("verify"), /round 1's fixes have not been reviewed/);
  ok(s.gate("check"));
  ok(s.gate("round", "start"), /Round 2 of at most 2[\s\S]*context only/);
  ok(s.gate("finding", "add", "--sev", "nit", "--label", "introduced", "--file", "t.sh", "--claim", "test name is vague"));
  ok(s.gate("round", "end", "--read", "Read the fix commit and its test; the test pins the expected output of 3."));
  no(s.gate("round", "start"), /no round 3|Checks have not passed|loop is over/i);
  ok(s.gate("verify"), /after 2 round/);
});

test("should-fixes cannot be fixed, declines need a kind, and two declines by Harshit become a proposed rule", () => {
  const s = sandbox();
  ok(s.gate("init", "--base", "main"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("finding", "add", "--sev", "should", "--label", "introduced", "--file", "app.sh", "--claim", "no retry"));
  no(s.gate("finding", "fix", "R1-1", "--files", "x", "--cmd", "true"), /Only blockers get fixed/);
  ok(s.gate("finding", "add", "--sev", "blocker", "--label", "introduced", "--file", "app.sh", "--claim", "no null guard"));
  no(s.gate("finding", "decline", "R1-2", "--reason", "internal input", "--kind", "Null Guard"), /kebab-case/);
  ok(s.gate("finding", "decline", "R1-2", "--reason", "input is typed internally", "--kind", "missing-null-guard", "--by", "harshit"));
  ok(s.gate("finding", "add", "--sev", "blocker", "--label", "introduced", "--file", "app.sh", "--claim", "no null guard again"));
  ok(s.gate("finding", "decline", "R1-3", "--reason", "same: typed input", "--kind", "missing-null-guard", "--by", "harshit"));
  ok(s.gate("round", "end", "--read", "Read app.sh; both null-guard claims rely on input that the type already rules out."));
  ok(s.gate("verify"));
  ok(s.gate("learn", path.dirname(s.dir)), /Do not flag missing-null-guard\. Harshit declined it 2 times/);
});

test("a risky change escalates to Harshit instead of getting round 2", () => {
  const s = sandbox({ risky: ["auth/**"] });
  s.sh("mkdir -p auth && echo x > auth/login.sh");
  s.commit("touch auth");
  ok(s.gate("init", "--base", "main"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("finding", "add", "--sev", "blocker", "--label", "introduced", "--file", "app.sh", "--claim", "wrong value"));
  ok(s.gate("round", "end", "--read", "Read app.sh and auth/login.sh; the value change breaks the login caller's parse."));
  writeFileSync(path.join(s.dir, "t.sh"), "[ \"$(sh app.sh)\" = 3 ]\n");
  writeFileSync(path.join(s.dir, "app.sh"), "echo 3\n");
  s.commit("fix");
  ok(s.gate("finding", "fix", "R1-1", "--files", "t.sh", "--cmd", "sh t.sh"));
  ok(s.gate("check"));
  no(s.gate("round", "start"), /Escalated to Harshit[\s\S]*auth\/login\.sh/);
  no(s.gate("verify"), /SOL_LOOP=waived/);
});

test("a security blocker escalates as soon as it is recorded", () => {
  const s = sandbox();
  ok(s.gate("init", "--base", "main"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("finding", "add", "--sev", "blocker", "--label", "introduced", "--risk", "security", "--file", "app.sh", "--claim", "leaks a token"), /escalated to Harshit/);
});

test("a change written by an unknown model must name its author", () => {
  const s = sandbox();
  s.sh("git commit -q --amend -m 'no trailer'");
  no(s.gate("init", "--base", "main"), /--author claude or --author codex/);
  ok(s.gate("init", "--base", "main", "--author", "codex"), /reviewer is claude-opus/);
});

test("S1 a check that rewrites tracked files does not certify the commit", () => {
  const s = sandbox();
  writeFileSync(path.join(s.dir, "check.sh"), "echo rewritten > app.sh\n");
  s.commit("an autofixing check");
  ok(s.gate("init", "--base", "main"));
  no(s.gate("check"), /A check changed files/);
});

test("S2 verify reruns every earlier fix test, so a later change cannot undo a fix silently", () => {
  const s = sandbox();
  ok(s.gate("init", "--base", "main"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("finding", "add", "--sev", "blocker", "--label", "introduced", "--file", "app.sh", "--claim", "prints 2, callers expect 3"));
  ok(s.gate("round", "end", "--read", "Read app.sh and its only caller; the caller parses the output and expects 3."));
  writeFileSync(path.join(s.dir, "t.sh"), "[ \"$(sh app.sh)\" = 3 ]\n");
  writeFileSync(path.join(s.dir, "app.sh"), "echo 3\n");
  s.commit("fix");
  ok(s.gate("finding", "fix", "R1-1", "--files", "t.sh", "--cmd", "sh t.sh"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("round", "end", "--read", "Read the fix commit and its test; the test pins the expected output of 3."));
  writeFileSync(path.join(s.dir, "app.sh"), "echo 4\n");
  s.commit("a later change that breaks the fix");
  ok(s.gate("check"));
  no(s.gate("verify"), /R1-1's fix test fails on HEAD/);
});

test("S3 a plain rebase after a clean round still approves", () => {
  const s = sandbox();
  ok(s.gate("init", "--base", "main"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("round", "end", "--read", "Read app.sh and check.sh; the only change swaps the printed value and nothing calls it."));
  s.sh("git checkout -q main && echo other > other.txt && git add other.txt && git commit -qm 'main moves' && git checkout -q feat && git rebase -q main");
  ok(s.gate("check"));
  ok(s.gate("verify"), /Approved/);
  writeFileSync(path.join(s.dir, "app.sh"), "echo 9\n");
  s.commit("new work after the rebase");
  ok(s.gate("check"));
  no(s.gate("verify"), /not a plain rebase/);
});

test("S4 the risk verdict counts commit statuses and refuses an unstable merge state", async () => {
  const { riskVerdict } = await import(GATE);
  const sha = "f".repeat(40);
  const clean = {
    pr: { head: { sha }, mergeable_state: "clean" },
    files: ["src/app.ts"],
    runs: [{ name: "ci", status: "completed", conclusion: "success" }],
    statuses: [],
    reviews: [{ id: 1, user: { login: "chatgpt-codex-connector[bot]" }, commit_id: sha, state: "COMMENTED" }],
    comments: [],
    risky: ["auth/**"],
  };
  assert.equal(riskVerdict(clean).verdict, "AUTO-APPROVE");
  const failed = riskVerdict({ ...clean, statuses: [{ context: "legacy-ci", state: "failure" }] });
  assert.equal(failed.verdict, "NEEDS-HARSHIT");
  assert.match(failed.why.join(), /legacy-ci=failure/);
  assert.equal(riskVerdict({ ...clean, pr: { ...clean.pr, mergeable_state: "unstable" } }).verdict, "NEEDS-HARSHIT");
  assert.equal(riskVerdict({ ...clean, files: ["auth/login.ts"] }).verdict, "NEEDS-HARSHIT");
});

test("stale-test mode proves a fix that updates a test the reviewed change broke", () => {
  const s = sandbox();
  s.sh("git checkout -q main && printf '[ \"$(sh app.sh)\" = 1 ]\\n' > t.sh && git add t.sh && git commit -qm 'old test' && git checkout -q feat && git rebase -q main");
  ok(s.gate("init", "--base", "main"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("finding", "add", "--sev", "blocker", "--label", "introduced", "--file", "t.sh", "--claim", "t.sh still expects 1 after the change prints 2"));
  ok(s.gate("round", "end", "--read", "Read app.sh and t.sh; the change prints 2 and the existing test still asserts 1."));
  writeFileSync(path.join(s.dir, "t.sh"), "[ \"$(sh app.sh)\" = 2 ]\n");
  s.commit("update the stale test");
  no(s.gate("finding", "fix", "R1-1", "--files", "t.sh", "--cmd", "sh t.sh"), /passes without the fix/);
  ok(s.gate("finding", "fix", "R1-1", "--files", "t.sh", "--cmd", "sh t.sh", "--stale-test"), /failed without the fix/);
});

test("R2 verify stays approved after a rebase, and a second rebase approves too", () => {
  const s = sandbox();
  ok(s.gate("init", "--base", "main"));
  ok(s.gate("check"));
  ok(s.gate("round", "start"));
  ok(s.gate("round", "end", "--read", "Read app.sh and check.sh; the only change swaps the printed value and nothing calls it."));
  const rebase = (file) => s.sh(`git checkout -q main && echo x > ${file} && git add ${file} && git commit -qm 'main moves' && git checkout -q feat && git rebase -q main`);
  rebase("one.txt");
  ok(s.gate("check"));
  ok(s.gate("verify"), /Approved/);
  ok(s.gate("verify"), /Approved/);
  rebase("two.txt");
  ok(s.gate("check"));
  ok(s.gate("verify"), /Approved/);
});
