# Product steering — Dead Reckoning

> Status: locked 2026-11-05. Kiro reads this file on every task.

## What this is

A drone-based stocktake system for warehouses. It reads the barcodes already on the shelves,
counts what it sees, and uses those same tags as position fixes so it knows where it is without
any installed infrastructure.

## Who it is for

The warehouse operations lead who currently pays two people to walk aisles with a clipboard, and
the inventory manager who finds out about a miscount at month end.

## The problem, in one sentence

Cycle counting is hours of human walking per aisle per week, and every existing drone system
solves it by instrumenting the building first — markers, motion capture, or RTK — which costs more
than the labour it replaces.

## The thesis, in one sentence

The shelf labels are the map.

## What it must never do

- Never claim a stock count is correct when confidence is low. Show the uncertainty.
- Never invent a position. If there is no tag and no flow, say "unknown" and stop.
- Never claim production readiness, regulatory approval, or a customer that does not exist.

## What good looks like

The drone flies one shelf row. The map fills in as it goes: bays, counts, gaps, duplicates. The
operator sees a number they can act on before the battery lands.

## Voice

Operational, specific, unexcited. Numbers over adjectives. "14 of 16 bays counted, 2 need a
rescan" — not "revolutionary inventory intelligence".
