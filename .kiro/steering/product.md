# Product steering — Stratum

> Status: locked 2026-11-06 after the pivot from Fold. Kiro reads this file on every task.

## What this is

A generator that turns four photographs of an object into a stack of flat cut layers, plus a
measurement of how much fidelity the fabrication constraints cost.

## Who it is for

A maker with a laser cutter or a knife, who wants a physical model of a real object. Secondarily,
a secondary-school maths teacher teaching projection and cross-sections with something students
can hold.

## The problem, in one sentence

Photogrammetry needs dozens of photos and a cloud; a maker needs a model from the four photos they
already have, and needs to know which details the process will lose before they cut material.

## What it must never do

- Never claim general 3D reconstruction. The supported class is stated on screen.
- Never claim "any object". Silhouettes cannot see concavities; layers cannot see undercuts.
- Never present a reconstruction as faithful without its IoU numbers beside it.
- Never hide the capture protocol. Four views, 90° apart, upright, light fixed.
- Never claim material generality beyond the stated card and plywood thicknesses.
- Never ship a model whose layers are not connected after bridging.

## What good looks like

A maker photographs a bottle from four sides. The app shows the model, the per-view IoU, and a
stack of twelve layers. They cut it, stack it on a rod, and set it on the desk beside the bottle.
From each of the four directions, the silhouette matches the photo they took. The whole thing
takes twenty minutes.

## Voice

Plain, specific, unhurried. "Twelve layers, 3 mm ply, about twenty minutes." No exclamation marks,
no "unleash your creativity". The tone of a good workshop manual, not a startup landing page.
