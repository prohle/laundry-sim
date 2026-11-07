#!/usr/bin/env bash
# Run one Kiro task and print only what matters.
#
# Why: dispatching a task is a fixed sequence -- launch, capture the log,
# strip the tool chatter, extract the final report, work out the credits.
# Doing that by hand costs several model round trips and produces noise.
#
# Usage: tools/kiro.sh <brief-file> [--agent NAME]
#
# Prints: the agent's final message, then one line of credit accounting.
# The full log is kept in tools/out/kiro-<stamp>.log.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BRIEF="${1:-}"
AGENT="fold-builder"
[ "${2:-}" = "--agent" ] && AGENT="${3:-fold-builder}"

if [ -z "$BRIEF" ] || [ ! -f "$BRIEF" ]; then
  echo "usage: tools/kiro.sh <brief-file> [--agent NAME]" >&2
  exit 2
fi

export PATH="$HOME/.cargo/bin:$PATH"
mkdir -p tools/out
STAMP=$(date +%Y%m%dT%H%M%S)
LOG="tools/out/kiro-$STAMP.log"

# Credits before the run, so the delta is this task's cost.
before=$(tools/credits.sh --total 2>/dev/null || echo 0)

kiro-cli chat --agent "$AGENT" --no-interactive --trust-all-tools --trust-workspace \
  "$(cat "$BRIEF")" >"$LOG" 2>&1
rc=$?

after=$(tools/credits.sh --total 2>/dev/null || echo 0)

# The final report is the last block of lines that are not tool plumbing.
awk '
  /^\[tool\]/ || /^\[INFO\]/ || /^\[denied\]/ { next }
  /^\[/ { next }
  { print }
' "$LOG" | awk 'BEGIN{b=""} {b=b $0 "\n"} END{print b}' | sed -e '/^[[:space:]]*$/d' | tail -40

echo
printf -- '--- kiro: exit=%d  credits=%.2f  log=%s\n' "$rc" "$(awk -v a="$before" -v b="$after" 'BEGIN{print b-a}')" "$LOG"

exit "$rc"
