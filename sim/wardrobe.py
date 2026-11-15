"""Wardrobe table: read the five clean tables in sim/out/, write sim/out/wardrobe.md. Runs no eval."""
import re
from pathlib import Path

OUT = Path(__file__).parent / "out"
KINDS = [
    ("towel", "clean.md", "55/55 on the 10 unseen drops (patch 0.16 study)"),
    ("tee", "tee-clean.md", "half fold, hems to the shoulder line"),
    ("pants", "pants-clean.md", "scaled to the board (0.44 x 0.70)"),
    ("shorts", "shorts-clean.md", "scaled to the board (0.44 x 0.55)"),
    ("dress", "dress-clean.md", "one drop fails the on-top check, deterministically"),
]
ROW = re.compile(r"^s\d+\s+\d+\s+(?:\S+°\s+)?(-?\d+\.\d+)\s+(-?\d+\.\d+)\s.*\b(FOLDED|FAILED)\s*(?:\s+\S+)?$")


def tally(name):
    text = (OUT / name).read_text(encoding="utf-8")
    if name == "clean.md":  # two configs; the wardrobe uses the last, patch 0.16
        text = text[text.rindex("Patch 0.16"):]
    runs = folded = 0
    drops = set()
    for line in text.splitlines():
        m = ROW.match(line)
        if m:
            runs += 1
            folded += m.group(3) == "FOLDED"
            drops.add((m.group(1), m.group(2)))
    return runs, folded, len(drops)


def main():
    lines = [f"{'kind':<7} {'runs':>4}  {'folded':>6}  {'distinct':>8}  note"]
    for kind, name, note in KINDS:
        runs, folded, distinct = tally(name)
        lines.append(f"{kind:<7} {runs:>4}  {folded:>6}  {distinct:>8}  {note}")
    table = "\n".join(lines)
    header = ("Simulated wardrobe, kinematic grasp, seeds 11-20 x 10 runs per garment. Yaw 0, position +-0.04 m.\n"
              "100 runs are 19 distinct drops: run i of seed s draws from rng(s+i).\n\n")
    (OUT / "wardrobe.md").write_text(header + "```\n" + table + "\n```\nSimulated, not a physical fold.\n",
                                     encoding="utf-8")
    print(table)


if __name__ == "__main__":
    main()
