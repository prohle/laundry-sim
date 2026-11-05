# Kiroween 2026 — the hunt

**Prize:** Kiroween 2026, sponsored by AWS, administered by Devpost
**Deadline:** Friday **4 December 2026, 2:00 pm PT** — no extensions, late submissions rejected
**Target:** 1st Place Overall, **$30,000**, plus the $10,000 Best Startup bonus
**Status:** ACTIVE
**Verified:** 2026-11-04 against https://kiroween.devpost.com/rules

## Why this one

It is the only prize on the board that pays five figures for a **new** build inside 30 days.
The rules explicitly reward a complete, polished product over a technical proof of concept, and
half the score is presentation and design — which is winnable by one person who ships carefully.

## The one-sentence brief

> A cheap custom drone that counts warehouse stock by reading the labels already on the shelves —
> and uses those same labels to know where it is.

Category: **Frankenstein**. Target: **1st overall, $30,000**. Full reasoning in
`docs/strategy.md`.

## Hard constraints (from the official rules)

- Work must be **newly created after 30 October 2026**. Pre-existing code must be disclosed —
  see "Prior work" below.
- Repo must be **public on GitHub**, with an **OSI license visible in the About section**.
- Repo must contain **`/.kiro/` at the root** (specs, hooks, steering) and it must **not** be
  gitignored. This is a disqualification risk, not a nicety.
- Demo video **under 3 minutes**, public on YouTube, showing the product actually working.
- Working URL judges can reach, free of charge, through the judging period.
- Kiro credits: 4,000 per entrant, **request by 1 December 2026, 12:00 pm PT**.

## Prior work — what the rules allow

> Projects must be newly created by the Entrant after the start of the Hackathon Submission
> Period. Participants may use standard development resources, including frameworks, libraries,
> starter templates, but must disclose any other pre-existing code or work incorporated into the
> Project.

So the build starts from an empty repo. What is allowed:

| Allowed | Must disclose | Not allowed |
|---|---|---|
| Frameworks, libraries, package managers | Yes, in the dependency list | Any pre-written application code |
| Starter templates and scaffolds | Yes, named explicitly | Code from a previous product |
| Public datasets and APIs | Yes, with source | Reused UI or design system from another project |

Disclosure goes in **two places**, both required:

1. `README.md` → a "Prior work" section, written plainly: *"No pre-existing application code.
   Built during the submission period. Scaffolded with `<tool>`; dependencies listed below."*
2. The Devpost submission description → the same sentence, in the same words.

The strongest evidence is structural: the **first commit is the spec**, dated inside the
submission window, and `.kiro/` shows the design work happening before the code. Judges can read
the history.

## Repo layout

```
README.md            this file
docs/rules.md        verified rules digest
docs/strategy.md     rubric mapping, category choice, concept options
docs/plan.md         30-day schedule
SUBMISSION.md        submission checklist
.kiro/               steering + specs (required by the rules)
```

## Next actions

1. **Hover test by 8 November.** Does the airframe hold position indoors for 60 seconds? If not,
   manual flight is locked in and tuning stops. This gate decides the project.
2. Write the spec in `.kiro/specs/` before any application code.
3. Install Kiro, request the 4,000 credits, join `#kiroween-hackathon` on Discord.
4. Create the public GitHub repo with MIT license and empty `/.kiro/`.
5. Record five minutes of shelf footage — handheld is fine. Perception is built against that
   before it ever flies.

## Rules of engagement

No claim that this is production-ready. No naming competitors in the video unless the claim has
been verified. Judges punish overclaiming harder than they punish small scope.
