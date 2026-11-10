"use client";

import { useState } from "react";

const REPO = "https://github.com/prohle/laundry-sim";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const ROWS = [
  { patch: "0.12", config: "0.12 m", runs: 100, success: "70/100", unseen: "35/55" },
  { patch: "0.16", config: "0.16 m", runs: 100, success: "100/100", unseen: "55/55" },
];

const COMMANDS = `cd sim
.venv/bin/python check.py                 # 13 checks, ~50 s
.venv/bin/python eval.py --runs 10 --seed 11
.venv/bin/python fold.py                  # one nominal fold, FOLDED
.venv/bin/python video.py                 # sim/out/fold.mp4`;

export default function Page() {
  const [patch, setPatch] = useState("0.16");

  return (
    <main>
      <section className="hero">
        <video src={`${base}/fold.mp4`} autoPlay muted loop playsInline />
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
        <div className="toggle" role="group" aria-label="Grasp patch">
          {ROWS.map((r) => (
            <button
              key={r.patch}
              type="button"
              aria-pressed={patch === r.patch}
              onClick={() => setPatch(r.patch)}
            >
              grasp patch {r.patch}
            </button>
          ))}
        </div>
        <table>
          <thead>
            <tr>
              <th>config</th>
              <th>runs</th>
              <th>success</th>
              <th>unseen drops</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.patch} className={patch === r.patch ? "on" : undefined}>
                <td>{r.config}</td>
                <td>{r.runs}</td>
                <td>{r.success}</td>
                <td>{r.unseen}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          10 distinct unseen drops. Depth 0.49–0.59 against 0.60. Width 0.91–0.98 against 0.90.
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
