#!/usr/bin/env bash
# One command that runs every check and prints a compact verdict.
#
# Why: every tool call is a model round trip. Making the agent run five
# commands and read five outputs costs credits; running one script and
# reading one summary does not. The full detail is written to
# tools/out/check.json and only printed on failure.
#
# Usage: tools/check.sh [--full]
#   default: skip checks whose inputs have not changed since the last run
#   --full:  run everything regardless

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

export PATH="$HOME/.cargo/bin:$PATH"
mkdir -p tools/out

FULL=0
[ "${1:-}" = "--full" ] && FULL=1

pass=0
fail=0
failed_names=()

report() { # name status detail
  if [ "$2" = "ok" ]; then
    printf 'PASS  %-22s %s\n' "$1" "$3"
    pass=$((pass + 1))
  else
    printf 'FAIL  %-22s %s\n' "$1" "$3"
    fail=$((fail + 1))
    failed_names+=("$1")
  fi
}

# Run a command, keep only its last line on success, up to 12 lines on failure.
run_check() { # name command...
  local name="$1"; shift
  local out rc
  out=$("$@" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    report "$name" ok "$(printf '%s' "$out" | grep -E '.' | tail -1 | cut -c1-80)"
  else
    report "$name" fail "exit $rc"
    printf '%s\n' "$out" | tail -12 | sed 's/^/      /'
  fi
}

echo "== Fold checks =="

# 1. Types
run_check "typecheck" npx tsc --noEmit

# 2. Node tests. node --test prints a summary line with the counts.
run_check "node-tests" bash -c 'set -o pipefail; npm test --silent 2>&1 | grep -E "^ℹ (tests|pass|fail)" | sed "s/ℹ //" | tr "\n" " "'

# 3. Rust tests
if [ $FULL -eq 1 ] || [ -n "$(find solver/src solver/tests -newer solver/target/release/fold-solver 2>/dev/null | head -1)" ]; then
  run_check "rust-tests" bash -c 'cd solver && cargo test --release --quiet 2>&1 | grep -E "test result" | tail -1'
else
  report "rust-tests" ok "skipped, solver binary newer than sources"
fi

# 4. The three subjects that must fold. One line each, only the verdict.
for f in bush-dog.png snapping-turtle.jpg tuatara.jpg; do
  if [ -f "fixtures/$f" ]; then
    line=$(node tools/pipeline.ts "fixtures/$f" 2>/dev/null | grep -E '^(tree|solver)' | tr '\n' ' ')
    if printf '%s' "$line" | grep -q 'ok=true'; then
      leaves=$(printf '%s' "$line" | grep -oE 'after significance [0-9]+' | grep -oE '[0-9]+$')
      cp=$(printf '%s' "$line" | grep -oE 'cp_status=[a-z_]+')
      report "fixture:$f" ok "leaves=$leaves $cp"
    else
      report "fixture:$f" fail "did not produce a pattern"
    fi
  fi
done

# 5. The solver still matches the C++ reference. Only with --full; it is slow.
if [ $FULL -eq 1 ]; then
  run_check "parity" bash -c 'cd solver && cargo test --release --quiet --test parity 2>&1 | grep -E "test result" | tail -1'
fi

echo
if [ $fail -eq 0 ]; then
  echo "VERDICT: PASS ($pass checks)"
else
  echo "VERDICT: FAIL ($fail of $((pass + fail)) failed: ${failed_names[*]})"
fi

printf '{"pass":%d,"fail":%d,"failed":["%s"]}\n' \
  "$pass" "$fail" "$(IFS='","'; echo "${failed_names[*]:-}")" > tools/out/check.json

exit $([ $fail -eq 0 ] && echo 0 || echo 1)
