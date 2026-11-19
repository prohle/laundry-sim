# Brief 49 — the replay player

Implement task **10.2**: the page gains a player that scrubs the real simulation.

## Install

`three` from npm (local, no CDN). Remove nothing else.

## `src/app/ReplayPlayer.tsx`

A client component that takes `kind` and loads `/replay-<kind>.json`:

- **Scene** from `static`: every box (`THREE.BoxGeometry` from `size_is` half-extents — the JSON says
  which), positioned and coloured; skip boxes flagged `hidden`.
- **Arms** from the joint chain in `joints`: rebuild the hierarchy (parent, relative pos/quat, joint
  axis), apply each frame's `angles` to the 8 hinges and `grip` to the fingers. The chain entries carry
  everything you need; no inverse kinematics, no re-solving — replay only.
- **Cloth** from `cloth` + `faces` + `cloth_rgba`: a `BufferGeometry`, positions updated per frame.
- **Controls**: a range input bound to the frame index, play/pause at the JSON's fps, the frame counter
  and the simulated seconds, and `OrbitControls` (drag to rotate).
- **Fold log** beside the canvas, from `log` and `summary`: the step name, width ratio, depth ratio,
  on-top mm with their limits, the laid-flat and folded sizes, the cycle time, and the FOLDED verdict.
  The `phases` array backs a one-line "how it folds" step list under the scrub bar.
- **Label**, always visible near the canvas: *"A replay of the physics simulation — every frame is
  from MuJoCo. Nothing here is animated."*

## The page

The garment selector now drives the player in a new **Machine** section between the hero and the
results table: selecting a garment switches both the hero video and the replay. The selector's
existing behaviour does not change otherwise. Keep every existing section; the page may grow to
~400 lines, no more.

## Constraints

- No CDN, no external fonts, no `eval`.
- One `useEffect` for the three.js lifecycle; no per-frame React state (drive the scrub with a ref and
  requestAnimationFrame).
- The JSONs are `public/replay-tee.json` and `public/replay-towel.json`; export pants, shorts and
  dress only if the turn has room — the player must handle them when they exist.

## Acceptance

```
npm run build
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/laundry-sim npm run build
```

Both exit 0. The player compiles, loads the tee JSON, and the scrub bar moves the cloth and the arms.

## Report

The component's line count, what you drew from the JSON, whether pants/shorts/dress were exported, and
anything in the JSON schema that was awkward to consume. Do not commit.
