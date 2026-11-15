"use client";

import { useState } from "react";

const REPO = "https://github.com/prohle/laundry-sim";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Source: sim/out/wardrobe.md (written by sim/wardrobe.py).
const WARDROBE = [
  { kind: "towel", video: "fold.mp4", runs: 100, folded: 100, distinct: 19, note: "55/55 on the 10 unseen drops (patch 0.16 study)" },
  { kind: "tee", video: "fold-tee.mp4", runs: 100, folded: 100, distinct: 19, note: "half fold, hems to the shoulder line" },
  { kind: "pants", video: "fold-pants.mp4", runs: 100, folded: 100, distinct: 19, note: "scaled to the board (0.44 x 0.70)" },
  { kind: "shorts", video: "fold-shorts.mp4", runs: 100, folded: 100, distinct: 19, note: "scaled to the board (0.44 x 0.55)" },
  { kind: "dress", video: "fold-dress.mp4", runs: 100, folded: 92, distinct: 19, note: "one drop fails the on-top check, deterministically" },
];

const COMMANDS = `cd sim
.venv/bin/python check.py                 # 20 checks
.venv/bin/python eval.py --runs 10 --seed 11
.venv/bin/python fold.py                  # one nominal fold, FOLDED
.venv/bin/python video.py                 # sim/out/fold.mp4`;

export default function Page() {
  const [kind, setKind] = useState("tee");
  const current = WARDROBE.find((r) => r.kind === kind) ?? WARDROBE[1];

  return (
    <main>
      <section className="hero">
        <div className="toggle" role="group" aria-label="Garment">
          {WARDROBE.map((r) => (
            <button
              key={r.kind}
              type="button"
              aria-pressed={kind === r.kind}
              onClick={() => setKind(r.kind)}
            >
              {r.kind}
            </button>
          ))}
        </div>
        <video key={current.video} src={`${base}/${current.video}`} autoPlay muted loop playsInline />
        <p className="caption">simulated · no machine was built</p>
      </section>

      <section>
        <h1>Laundry</h1>
        <p className="claim">
          A simulated laundry-folding cabinet, and the instrument that decides whether it is worth
          building.
        </p>
        <p>
          In 2015 a $16,000 folding cabinet was shown and pre-ordered. In 2019 its maker went
          bankrupt. Two companies built the cabinet first. This project does it the other way round:
          the simulation comes first and measures the machine before any metal is cut.
        </p>
      </section>

      <section>
        <h2>The result</h2>
        <table>
          <thead>
            <tr>
              <th>kind</th>
              <th>runs</th>
              <th>folded</th>
              <th>distinct</th>
              <th>note</th>
            </tr>
          </thead>
          <tbody>
            {WARDROBE.map((r) => (
              <tr key={r.kind} className={kind === r.kind ? "on" : undefined}>
                <td>{r.kind}</td>
                <td>{r.runs}</td>
                <td>{r.folded}</td>
                <td>{r.distinct}</td>
                <td>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          Simulated, kinematic grasp, seeds 11–20. 100 runs are 19 distinct drops; run i of seed s
          draws from rng(s+i).
        </p>
        <p className="note">
          Dress: the failing drop fails the on-top check every time it is drawn; the other 18
          distinct drops fold.
        </p>
        <p className="note">
          Towel study: grasp patch 0.12 m folded 35/55 unseen drops, patch 0.16 m folded 55/55.
        </p>
      </section>

      <section>
        <h2>What counts as a fold</h2>
        <div className="numbers">
          <div><code>width ≥ 0.90</code></div>
          <div><code>depth ≤ 0.60</code></div>
          <div><code>on top ≥ 2 mm</code></div>
        </div>
        <p className="note">A heap fails all three.</p>
      </section>

      <section>
        <h2>Three limits found in a day</h2>
        <div className="cards">
          <div>
            <strong>3 cm more forearm</strong>
            <span>0/50 · upper joint at its limit</span>
          </div>
          <div>
            <strong>a fitted policy</strong>
            <span>no gain · the machine was the limit</span>
          </div>
          <div>
            <strong>a contact grasp</strong>
            <span>0/10 · fingers cannot pinch a flat sheet</span>
          </div>
        </div>
      </section>

      <section>
        <h2>Limits</h2>
        <ul>
          <li>
            One fold per garment, along the board&apos;s depth axis. The fixed symmetric arms cannot
            fold along the width axis (both grasp points would sit on one side; the far arm cannot
            reach), so the legs-together fold for pants is out of reach with this machine.
          </li>
          <li>Garments are scaled to the board.</li>
          <li>Kinematic grasp. The contact grasp folded 0/10: fingers cannot pinch a flat sheet.</li>
          <li>Yaw fixed at 0. 19 distinct drops. Wrinkle is a proxy.</li>
        </ul>
      </section>

      <section>
        <h2>Run it</h2>
        <pre>{COMMANDS}</pre>
      </section>

      <section>
        <h2>Kiro</h2>
        <p>21 implementation turns.</p>
        <p>37.5 credits.</p>
        <p>
          Spec + steering + hook + MCP.{" "}
          <a href={`${REPO}/blob/main/docs/kiro-usage.md`}>docs/kiro-usage.md</a>
        </p>
      </section>

      <footer>
        <a href={REPO}>{REPO.replace("https://", "")}</a> · AGPL-3.0 · simulated throughout
      </footer>
    </main>
  );
}
