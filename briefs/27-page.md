# Brief 27 — the live page

Implement task **5.9** (add it to `tasks.md` first if it is not there). Replace the retired Fold page
with a single-page product site for Laundry.

## Files

- **Replace** `src/app/page.tsx` with the page below. Delete `FoldView.tsx`, `Hollow.tsx`,
  `NetFoldView.tsx` and the whole `src/app/api/` directory — they belong to Fold and must not be
  imported.
- **Replace** `src/app/globals.css` with a short stylesheet for this page (under 200 lines).
- **Update** `src/app/layout.tsx` metadata: title "Laundry — a simulated folding machine", description
  as in the page.
- **Update** `package.json`: name `laundry-sim`, remove `jpeg-js`, `pngjs`, `three`, `@types/three`,
  and the Fold `test` script. Keep `dev`, `build`, `start`, `lint`.
- The video is already at `public/fold.mp4` (4 s, 1280x720). Do not re-encode it.

## The page

One column, max width 980 px, light background, no framework beyond React. Sections in order:

1. **Hero** — `<video src="/fold.mp4" autoPlay muted loop playsInline>` full width, rounded. Under it:
   `simulated · no machine was built`.
2. **Title and claim** — `Laundry`, then: *A simulated laundry-folding cabinet, and the instrument that
   decides whether it is worth building.* One paragraph: 2015, a $16,000 cabinet, pre-ordered; 2019,
   bankrupt; two companies built the cabinet first.
3. **The result** — a table with a two-button toggle (`grasp patch 0.12` / `0.16`):

   | config | runs | success | unseen drops |
   |---|---|---|---|
   | 0.12 m | 100 | 70/100 | 35/55 |
   | 0.16 m | 100 | 100/100 | 55/55 |

   Under it: *10 distinct unseen drops. Depth 0.49–0.59 against 0.60. Width 0.91–0.98 against 0.90.*
4. **What counts as a fold** — three numbers: `width ≥ 0.90`, `depth ≤ 0.60`, `on top ≥ 2 mm`. One
   sentence: a heap fails all three.
5. **Three limits found in a day** — three cards:
   `3 cm more forearm · 0/50 · upper joint at its limit`,
   `a fitted policy · no gain · the machine was the limit`,
   `a contact grasp · 0/10 · fingers cannot pinch a flat sheet`.
6. **Run it** — the four commands from the README, in a `<pre>`.
7. **Kiro** — three lines: 21 implementation turns, 37.5 credits, spec + steering + hook + MCP. Link to
   `docs/kiro-usage.md` on GitHub.
8. **Footer** — repo link, AGPL-3.0, `simulated throughout`.

## Constraints

- No Fold references anywhere: not in copy, not in imports, not in metadata.
- No claims beyond the README: simulated only, one garment family, kinematic grasp.
- No external fonts or CDNs. `next/font` is already installed; keep it or drop it.
- The page must build with `npm run build` and serve with `npm start`.

## Acceptance

```
npm run build
npm start   # then curl -s localhost:3000 | grep -c "simulated"
```

Build exits 0; the page returns 200 and contains "simulated" and "55/55"; `grep -rn "fold" src/app`
returns nothing except the video filename.

## Report

The build output, the curl check, the line count of the page and CSS, and anything you removed that the
build still needed. Do not commit.
