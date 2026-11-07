#!/usr/bin/env bash
# Report Kiro credit usage, read from the local session logs.
#
# Usage:
#   tools/credits.sh          # totals, mean per turn, per-session split
#   tools/credits.sh --total  # one number, for arithmetic in other scripts
#   tools/credits.sh --last   # credits used by the most recent turn
#
# Source of truth: ~/.kiro/sessions/*/*/messages.jsonl, field
# payload.promptTurnSummaries[].usage where payload.type == "usage_summary".

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

exec python3 - "$@" <<'PY'
import json, glob, sys, collections

mode = sys.argv[1] if len(sys.argv) > 1 else "report"

tot = 0.0
turns = 0
requests = 0
last = 0.0
last_stamp = ""
per = collections.Counter()

for f in glob.glob('/home/leyen/.kiro/sessions/*/*/messages.jsonl'):
    sid = f.split('/')[-2][:12]
    for line in open(f, errors='ignore'):
        try:
            d = json.loads(line)
        except Exception:
            continue
        p = d.get('payload') or {}
        if p.get('type') != 'usage_summary':
            continue
        for s in p.get('promptTurnSummaries', []):
            u = s.get('usage') or 0
            tot += u
            turns += 1
            per[sid] += u
            if u:
                last = u
                last_stamp = d.get('timestamp', '')
        requests += len(p.get('requestIds', []))

if mode == "--total":
    print(f"{tot:.4f}")
elif mode == "--last":
    print(f"{last:.4f}")
else:
    mean = tot / max(turns, 1)
    print(f"turns={turns}  credits={tot:.1f}  mean/turn={mean:.2f}  "
          f"requests={requests} ({requests/max(turns,1):.1f}/turn)")
    print(f"last turn: {last:.2f} credits at {last_stamp}")
    if mean > 6:
        print("WARNING: mean above 6 credits per turn -- tighten the briefs")
    for k, v in per.most_common(6):
        print(f"  {k}: {v:.1f}")
PY
