import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AREAS = ROOT / "skills/merge-risk/scripts/sensitive-areas"
CONFLICTS = ROOT / "skills/resolve-merge-conflicts/scripts/extract_conflict_context.py"
ENV = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}


def sh(cwd, *args, check=True):
    return subprocess.run(args, cwd=cwd, env=ENV, capture_output=True, text=True, check=check)


def repo(files):
    d = tempfile.mkdtemp()
    sh(d, "git", "init", "-q", "-b", "main")
    sh(d, "git", "config", "core.hooksPath", "/dev/null")
    for name, text in files.items():
        Path(d, name).parent.mkdir(parents=True, exist_ok=True)
        Path(d, name).write_text(text)
    sh(d, "git", "add", "-A")
    sh(d, "git", "commit", "-qm", "base")
    return d


def commit(d, files, msg):
    for name, text in files.items():
        Path(d, name).parent.mkdir(parents=True, exist_ok=True)
        Path(d, name).write_text(text)
    sh(d, "git", "add", "-A")
    sh(d, "git", "commit", "-qm", msg)


class SensitiveAreas(unittest.TestCase):
    def run_on(self, files):
        d = repo({"README.md": "x\n", "package.json": '{\n  "scripts": {"t": "a"},\n  "dependencies": {"left-pad": "^1.0.0"}\n}\n'})
        sh(d, "git", "switch", "-qc", "feat")
        commit(d, files, "change")
        r = sh(d, sys.executable, str(AREAS), "--base", "main", check=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        return {tuple(line.split("\t")[:2]) for line in r.stdout.splitlines()}, r.stdout

    def test_each_sensitive_area_is_named_by_path(self):
        found, _ = self.run_on({
            "src/auth/login.ts": "x\n",
            "src/billing/invoice.ts": "x\n",
            "db/migrations/001_users.sql": "x\n",
            ".github/workflows/ci.yml": "x\n",
            "app/rbac.py": "x\n",
            "app/user_data/export.py": "x\n",
            "pnpm-lock.yaml": "x\n",
            ".env.production": "x\n",
            "docs/guide.md": "x\n",
        })
        for area, path in [("auth", "src/auth/login.ts"), ("payments", "src/billing/invoice.ts"),
                           ("migrations", "db/migrations/001_users.sql"), ("infra/config", ".github/workflows/ci.yml"),
                           ("permissions", "app/rbac.py"), ("PII", "app/user_data/export.py"),
                           ("dependencies", "pnpm-lock.yaml"), ("secrets", ".env.production")]:
            self.assertIn((area, path), found)
        self.assertFalse(any(p == "docs/guide.md" for _, p in found), "a plain doc is not sensitive")

    def test_a_version_bump_in_package_json_is_a_dependency_change(self):
        found, _ = self.run_on({"package.json": '{\n  "scripts": {"t": "a"},\n  "dependencies": {"left-pad": "^1.3.0"}\n}\n'})
        self.assertIn(("dependencies", "package.json"), found)

    def test_a_scripts_only_package_json_change_is_not_a_dependency_change(self):
        found, out = self.run_on({"package.json": '{\n  "scripts": {"t": "b"},\n  "dependencies": {"left-pad": "^1.0.0"}\n}\n'})
        self.assertEqual(out.strip(), "none", out)

    def test_an_added_credential_is_flagged_whatever_the_path(self):
        found, _ = self.run_on({"src/client.ts": 'const API_KEY = "abcdef123456"\n'})
        self.assertIn(("secrets", "src/client.ts"), found)


class ConflictCheck(unittest.TestCase):
    def conflicted(self):
        d = repo({"a.txt": "one\n"})
        sh(d, "git", "switch", "-qc", "feat")
        commit(d, {"a.txt": "feat side\n"}, "feat")
        sh(d, "git", "switch", "-q", "main")
        commit(d, {"a.txt": "main side\n"}, "main")
        sh(d, "git", "switch", "-q", "feat")
        self.assertNotEqual(sh(d, "git", "merge", "main", check=False).returncode, 0)
        return d

    def check(self, d):
        return sh(d, sys.executable, str(CONFLICTS), "--check", check=False)

    def test_summary_names_the_conflicted_file_and_hunk(self):
        d = self.conflicted()
        r = sh(d, sys.executable, str(CONFLICTS), "--file", "a.txt", check=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("feat side", r.stdout)
        self.assertIn("main side", r.stdout)

    def test_check_fails_while_a_path_is_unmerged(self):
        r = self.check(self.conflicted())
        self.assertEqual(r.returncode, 1)
        self.assertIn("unmerged: a.txt", r.stdout)

    def test_check_fails_when_markers_were_staged(self):
        d = self.conflicted()
        sh(d, "git", "add", "a.txt")
        r = self.check(d)
        self.assertEqual(r.returncode, 1)
        self.assertIn("conflict marker: a.txt:1", r.stdout)

    def test_check_passes_once_resolved(self):
        d = self.conflicted()
        Path(d, "a.txt").write_text("both sides\n")
        sh(d, "git", "add", "a.txt")
        r = self.check(d)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("resolved", r.stdout)


if __name__ == "__main__":
    unittest.main()
