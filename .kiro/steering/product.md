# Product steering — Code Blue

> Status: draft. Locked when the concept is confirmed. Kiro reads this file on every task.

## What this is

An agentic triage layer that sits between a hospital's nurse call system and its on-call pagers.
It turns a free-text page into a routed, acknowledged, escalated event with an audit trail.

## Who it is for

The charge nurse who sends the page, and the resident who receives it. Not administrators, not
patients, not insurers.

## The problem, in one sentence

Pagers survive in hospitals because they work when the network does not, but a page is one-way,
free text, and unranked — so the right clinician finds out late, and nobody can prove who knew
what when.

## What it must never do

- Never diagnose, never recommend treatment, never output a clinical decision.
- Never invent an escalation policy. The policy is written by the customer and is the source of
  truth; the agent only applies it.
- Never take an irreversible action without an audit record.

## What good looks like

A nurse types four words. Ninety seconds later the correct clinician's pager buzzes with a
ranked reason. If nobody acknowledges in the policy window, the next one buzzes, and the log says
exactly why.

## Voice

Clinical, plain, unexcited. No exclamation marks. No "revolutionary". The product is calm because
the situation is not.
