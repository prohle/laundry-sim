# Brief 46 — the wardrobe on the page

Add task **8.5** to `tasks.md` first, then implement it. All five clean tables are in `sim/out/`:
`towel` (in `clean.md`), `tee-clean.md`, `pants-clean.md`, `shorts-clean.md`, `dress-clean.md`.

## 1. Task 8.3 — the wardrobe table

`sim/wardrobe.py`: one command, reads the five tables, writes `sim/out/wardrobe.md`:

```
kind    runs  folded  distinct  note
towel   100   100     19        55/55 on the 10 unseen drops (patch 0.16 study)
tee     100   100     19        half fold, hems to the shoulder line
pants   100   100     19        scaled to the board (0.44 x 0.70)
shorts  100   100     19        scaled to the board (0.44 x 0.55)
dress   100    92     19        one drop fails the on-top check, deterministically
```

Print the same table to stdout. Do not re-run any eval; read the files.

## 2. The page

- **Garment selector**: five buttons (towel, tee, pants, shorts, dress) above the hero. Each switches
  the hero video (`/fold.mp4`, `/fold-tee.mp4`, `/fold-pants.mp4`, `/fold-shorts.mp4`,
  `/fold-dress.mp4` — all already in `public/`) and the highlighted row in the results table. Default:
  tee.
- **Results section**: replace the two-row patch table with the wardrobe table from `wardrobe.md`, plus
  keep the patch 0.12 → 0.16 study as a one-line note under it (it is the towel's story). Add the
  seed-overlap caveat: *100 runs are 19 distinct drops; run i of seed s draws from rng(s+i)*.
- **The dress row** links or expands to one sentence: *the failing drop fails the on-top check every
  time it is drawn; the other 18 distinct drops fold.*
- **Limits section**: replace "one garment family (towel)" — it is stale. New limits:
  - one fold per garment, along the board's depth axis — the fixed symmetric arms cannot fold along
    the width axis (both grasp points would sit on one side; the far arm cannot reach), so the
    legs-together fold for pants is out of reach with this machine;
  - garments are scaled to the board;
  - kinematic grasp; contact grasp failed 0/10 with the cause;
  - yaw fixed at 0; 19 distinct drops; wrinkle is a proxy.
- Everything else (hero disclaimer, Kiro section, footer) unchanged.

## Acceptance

```
sim/.venv/bin/python sim/wardrobe.py
npm run build
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/laundry-sim npm run build
```

All exit 0. The page has five buttons, five videos, and the wardrobe table with the dress at 92.

## Report

The wardrobe table, the page's line count, and anything in the old copy that contradicted the new
results. Do not commit.
