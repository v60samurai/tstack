#!/bin/sh
# Builds a throwaway git repository for one verify-tstack journey and prints its path.
#   fixtures.sh sensitive <dir>   a feat branch touching auth, billing, a migration, CI, a lockfile and a credential
#   fixtures.sh conflict <dir>    a feat branch whose merge of main stops on a conflict in notes.md
set -eu
kind=$1 d=$2
rm -rf "$d" && mkdir -p "$d" && cd "$d"
g() { git -c user.name=verify -c user.email=verify@example.invalid -c core.hooksPath=/dev/null "$@"; }
g init -q -b main
printf '# demo\n' > README.md
printf '{\n  "dependencies": {"left-pad": "^1.0.0"}\n}\n' > package.json
printf 'line one\n' > notes.md
g add -A && g commit -qm base
g switch -qc feat
case $kind in
sensitive)
  mkdir -p src/auth src/billing db/migrations .github/workflows docs
  echo x > src/auth/login.ts; echo x > src/billing/invoice.ts; echo x > db/migrations/002_users.sql
  echo x > .github/workflows/ci.yml; echo x > docs/guide.md
  printf '{\n  "dependencies": {"left-pad": "^1.3.0"}\n}\n' > package.json
  printf 'const API_KEY = "abcdef1234567890"\n' > src/client.ts
  g add -A && g commit -qm "feat: touch sensitive areas"
  ;;
conflict)
  printf 'line one from feat\n' > notes.md && g commit -qam "feat: edit notes"
  g switch -q main && printf 'line one from main\n' > notes.md && g commit -qam "main: edit notes"
  g switch -q feat
  if g merge -q main >/dev/null 2>&1; then echo "fixtures.sh: expected a conflict" >&2; exit 1; fi
  ;;
*) echo "fixtures.sh: sensitive or conflict" >&2; exit 2 ;;
esac
pwd
