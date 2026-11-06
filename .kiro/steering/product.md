# Product steering — Fold

> Status: locked 2026-11-06, third and final direction for Kiroween 2026. Kiro reads this file on
> every task.

## What this is

A generator that turns a photograph of an object into an origami crease pattern, at a complexity
the user chooses.

## The chimera

A camera (2026), tree theory (1970s), TreeMaker (2006, abandoned), and a sheet of paper. The paper
becomes the photograph. Category: **Frankenstein**.

## Who it is for

A secondary-school maths or science teacher with no design skill and twenty minutes to prepare,
and a hobbyist who folds well but cannot design and will spend two hours on a hard model. The
complexity ladder is what lets one pipeline serve both.

## The problem, in one sentence

Origami is the cheapest physical model there is, and it is gated behind years of design study;
a teacher can print a worksheet in a minute and cannot design a foldable animal in a minute.

## What it must never do

- Never claim "any object". The supported class is four to twelve flaps, objects with limbs.
- Never allow cuts. Cutting is kirigami and it breaks the solver's assumption of one square.
- Never present a library lookup as generation.
- Never hide the minimum tier. If a subject needs eight flaps, say so before the user prints.
- Never print a pattern without a valid mountain/valley assignment or an explicit collapse.
- Never claim a faithful replica. A folded animal is an abstraction, and that is the art.
- Never show a robot folding. That renderer does not exist until January.

## What good looks like

A teacher photographs a beetle on her desk. The app puts a stick figure over it, tells her four
flaps cannot make six legs, and offers Hard. She prints it, folds for an hour, and sets a paper
beetle next to the photograph. The legs are where the legs are.

## Voice

Plain, specific, unhurried. "Six flaps, forty minutes, 80 gsm." No exclamation marks, no "unleash
your creativity". The tone of a good instruction sheet, not a startup landing page.
