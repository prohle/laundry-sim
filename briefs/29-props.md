# Brief 29 — property-based tests

Implement task **6.4** only. The rubric asks about property-based testing and the repo currently has
none. This closes a visible gap.

## File

`sim/test_props.py`, run directly:

```
sim/.venv/bin/python sim/test_props.py
```

Uses `hypothesis` (installed). No pytest. Print one line per property and a final verdict.

## Properties, at least these five

1. **`garment_vertex_count`** — for any kind in {towel, tee, pants, shorts, dress} and cell size in
   [0.02, 0.06], `build()` returns more than 50 vertices and no degenerate triangle (zero area).
2. **`garment_single_component`** — the same generated mesh has exactly one connected component.
3. **`no_nan`** — for any seed in [0, 50] and 50 steps, the cloth has no NaN and the z-range stays
   within [0.0, 2.0].
4. **`extent_monotone`** — the fold's y-extent never increases by more than 2 cm between consecutive
   samples (the trace), for 3 seeds.
5. **`deterministic`** — the same seed gives the same final (x-extent, y-extent, mean z) to 1e-9, for
   3 seeds.

Use `@given` with `st.integers` / `st.floats` and `max_examples=20` (keep the whole file under 60 s).
If a property needs the full fold, cap it to 2 seeds and say so.

## Wire it in

- `sim/check.py` gains `props`: runs the property file and asserts exit 0.
- Keep the runtime of `check.py` under 90 s; if it goes over, drop `props` from the check and say so.

## Acceptance

```
sim/.venv/bin/python sim/test_props.py
cd sim && .venv/bin/python check.py
```

Both exit 0; the property file prints five PASS lines and a count of examples run.

## Report

The five lines, the example counts, the runtime, and any property that had to be weakened (and why).
Do not commit.
