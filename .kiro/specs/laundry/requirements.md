# Requirements — Laundry

A simulated laundry-folding machine. Category: **Resurrection** — reviving the Laundroid, the
$16,000 folding cabinet that shipped a demo and a bankruptcy, with modern simulation and learning.

The claim is simulation-only. We did not build the machine. Every requirement below is about what
the simulator can demonstrate and measure, not about a physical device.

## R1 — The simulator runs

- Runs headless on this machine with no display, on CPU.
- One command starts it, steps it, and writes a PNG frame at 1280x720.
- No NaN, no divergence over 500 steps.

**Acceptance:** `sim/.venv/bin/python sim/run.py --frames 1` exits 0 and writes `sim/out/frame.png`.

## R2 — Garments are generated, not downloaded

- A parametric generator produces a **towel** (rectangle) and a **T-shirt** (T-shape with sleeves).
- Parameters: width, length, sleeve length, sleeve depth, cell size.
- Output is an OBJ that MuJoCo loads as a flex cloth.
- No third-party mesh, texture or asset. Nothing that cannot be redistributed.

**Acceptance:** `sim/.venv/bin/python sim/garment.py --kind tee --out sim/out/tee.obj` writes an OBJ
whose vertex and triangle counts are printed, and `--kind towel` writes a rectangle.

## R3 — The machine

- A cutaway cabinet: back, two sides, top, bottom, and a shelf the garment lies on.
- Two arms, each with a parallel-jaw gripper, mounted inside the cabinet.
- A fixed camera looking into the cabinet, and a second camera for a hero shot.

**Acceptance:** `sim/run.py --frames 1` renders the cabinet with the garment on the shelf, both arms
visible, and no geometry interpenetrating the cabinet walls.

## R4 — A scripted fold

- Two grippers grasp two corners of the garment and lay one half over the other.
- The grasp is a constraint (weld or pin), not friction-only, for the first version.
- The fold is detected by a geometric check, not by eye: the garment's projected footprint along the
  fold axis at least halves, and the two halves overlap within a tolerance.

**Acceptance:** `sim/fold.py` runs the scripted fold and prints `FOLDED` or `NOT FOLDED` with the
measured footprint before and after; exit 0 only on `FOLDED`.

## R5 — The evaluation harness

- N runs from randomised initial drops (seeded).
- Reports: success count, mean time to fold, and a wrinkle score.
- Same seed gives the same result.

**Acceptance:** `sim/eval.py --runs 5 --seed 1` prints a table and the same numbers when run twice.

## R6 — A learned policy (later)

- A policy that beats the scripted baseline on the same N runs.
- The improvement is reported as a table, never as a claim.

**Acceptance:** `sim/eval.py --policy learned --runs 20` prints a success rate higher than the
scripted baseline, with both numbers in the same table.

## R7 — Honesty

- Every run states that the fold is simulated.
- A fold is never claimed without the check in R4.
- No real machine, no real garment, no physical proof is implied.
