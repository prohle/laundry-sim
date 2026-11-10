# Product steering — Laundry

> Kiroween 2026, category **Resurrection**. The repo's earlier product (Fold) was retired on
> 2026-11-09 and is archived in `.kiro/archive/product-fold.md`.

## What this is

A simulated laundry-folding machine: a cabinet with two arms that folds a garment, an evaluation
harness that measures whether it folded, and a policy that learns to fold better.

It revives the **Laundroid** — the $16,000 folding cabinet that was demonstrated, pre-ordered, and
bankrupted in 2019 — as software. The machine is not built. The simulation is the instrument.

## The claim

> A policy folds a simulated garment, measured over N seeded runs.

Never: a machine folds laundry. Never: a photograph proves a fold.

## What it must never do

- **Never claim a physical machine or a physical fold.** Every result says "simulated".
- **Never report a fold without the check** in `sim/check.py`: extent ratio and overlap, printed.
- **Never download a mesh, texture or asset** that cannot be redistributed in a public repository.
  Generated garments only.
- **Never call a proxy a measurement.** The wrinkle score is a proxy; the README says so.
- **Never tune on the evaluation set and report the tuned number as generalisation.** Train/test split
  is stated in the table.
- **Never present a render as evidence.** The render is the demo; the table is the evidence.

## Voice

Plain, specific, unhurried. "480 g towel, 70 x 40 cm, 8 of 10 runs." No exclamation marks, no
"revolutionary", no "AI-powered".

## What good looks like

A judge opens the page, sees the cabinet fold a towel, reads a table that says the scripted baseline
succeeds 2 of 10 and the learned policy 8 of 10 on the same seeds, and understands in ten seconds
that the machine was never built and the result is still real.
