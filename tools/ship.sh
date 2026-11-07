#!/usr/bin/env bash
# Commit only if every check passes.
#
# Why: committing a broken tree and finding out later is the most expensive
# mistake in the loop, because the fix costs a full task. This makes the
# check the gate rather than a step someone remembers.
#
# Usage: tools/ship.sh "commit message"
#
# The message is passed through as-is, so multi-line messages work:
#   tools/ship.sh "$(cat <<'MSG'
#   Subject line
#
#   Body.
#   MSG
#   )"

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "usage: tools/ship.sh \"commit message\"" >&2
  exit 2
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "nothing to commit"
  exit 0
fi

echo "== checking before commit =="
if ! tools/check.sh; then
  echo
  echo "ABORTED: checks failed, nothing committed."
  exit 1
fi

echo
git add -A
git commit -q -m "$MSG"
printf 'committed: %s\n' "$(git log --oneline -1)"
