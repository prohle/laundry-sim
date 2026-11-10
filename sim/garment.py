"""Parametric garments (towel, tee, pants, shorts, dress) as triangle meshes in the XZ plane (y = 0).

Generated, never downloaded. Lattice vertices are shared between cells, so the mesh is welded by
construction. Coordinates: x across, z up, garment top edge at z = H.
Tee: body spans x in [0, W]; sleeves extend to x < 0 and x > W, from the top down to `sleeve_depth`.
Pins are the two vertices nearest to (0, H - sleeve_depth) and (W, H - sleeve_depth).
For the towel the same rule applies with depth 0: the two top corners.
build_full also returns named landmarks {name: (x, z)} for fold programs.
"""
import argparse
import math

DEFAULTS = {
    "towel": dict(width=0.70, height=0.40, cell=0.035, mass=0.48),
    "tee": dict(width=0.50, height=0.70, sleeve=0.20, sleeve_depth=0.18, cell=0.035, mass=0.30),
    "pants": dict(width=0.44, height=0.95, inseam=0.55, gap=0.05, cell=0.035, mass=0.45),
    "shorts": dict(width=0.44, height=0.55, inseam=0.28, gap=0.05, cell=0.035, mass=0.25),
    "dress": dict(width=0.40, height=1.00, hem=0.70, cell=0.035, mass=0.40),
}


def _grid(kind, p):
    """Return (cells, dx, dz, targets, pin_targets). Cells are (i, j) lattice squares; targets are (x, z)."""
    W, H, cell = p["width"], p["height"], p["cell"]
    nh = max(1, round(H / cell))
    dz = H / nh
    if kind in ("towel", "tee"):
        sleeve = p.get("sleeve", 0.0) if kind == "tee" else 0.0
        depth = p.get("sleeve_depth", 0.0) if kind == "tee" else 0.0
        nw = max(1, round(W / cell))
        ns = round(sleeve / cell) if sleeve else 0
        nd = min(nh, round(depth / cell)) if depth else 0
        dx = W / nw
        cells = [(i, j) for i in range(nw) for j in range(nh)]
        if ns and nd:
            sleeve_i = list(range(-ns, 0)) + list(range(nw, nw + ns))
            cells += [(i, j) for i in sleeve_i for j in range(nh - nd, nh)]
        pz = H - nd * dz
        t = {}
        if kind == "tee":
            t = {"sleeve_l": (-ns * dx, pz), "sleeve_r": (W + ns * dx, pz), "hem_l": (0, 0), "hem_r": (W, 0),
                 "shoulder_l": (0, H), "shoulder_r": (W, H)}
        return cells, dx, dz, t, ((0.0, pz), (W, pz))
    if kind in ("pants", "shorts"):
        nw = max(3, round(W / cell))
        ng = max(1, round(p["gap"] / cell))
        if (nw - ng) % 2:
            nw += 1
        dx = W / nw
        leg = (nw - ng) // 2
        nl = max(1, min(nh - 1, round(p["inseam"] / dz)))   # rows that are legs (from the hem up)
        cells = [(i, j) for i in range(nw) for j in range(nh) if j >= nl or i < leg or i >= leg + ng]
        t = {"waist_l": (0, H), "waist_r": (W, H), "hem_l": (0, 0), "hem_r": (W, 0), "crotch": (W / 2, nl * dz)}
        return cells, dx, dz, t, (t["waist_l"], t["waist_r"])
    # dress: bodice width `width` down to 0.6 H, then a linear flare to `hem` at the bottom
    nmax = max(2, round(p["hem"] / cell))
    nb = round(W / cell)
    nb += (nmax - nb) % 2
    cells = []
    for j in range(nh):
        f = min(1.0, max(0.0, (0.6 * H - (j + 0.5) * dz) / (0.6 * H)))
        n = round(nb + (nmax - nb) * f)
        n += (nmax - n) % 2
        i0 = (nmax - n) // 2
        cells += [(i, j) for i in range(i0, i0 + n)]
    x0, x1 = (nmax - nb) // 2 * cell, ((nmax - nb) // 2 + nb) * cell
    t = {"shoulder_l": (x0, H), "shoulder_r": (x1, H), "hem_l": (0, 0), "hem_r": (nmax * cell, 0)}
    return cells, cell, dz, t, (t["shoulder_l"], t["shoulder_r"])


def build_full(kind, **params):
    """Return (verts, faces, pins, landmarks). verts [(x, y, z)], faces 0-based, pins (left_id, right_id),
    landmarks {name: (x, z)} at the nearest mesh vertex, in the garment's local frame."""
    if kind not in DEFAULTS:
        raise ValueError(f"unknown kind {kind!r}")
    cells, dx, dz, targets, pin_t = _grid(kind, {**DEFAULTS[kind], **params})
    cells.sort()
    index, verts, faces = {}, [], []

    def vid(i, j):
        if (i, j) not in index:
            index[(i, j)] = len(verts)
            verts.append((i * dx, 0.0, j * dz))
        return index[(i, j)]

    for i, j in cells:
        a, b, c, d = vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)
        faces += [(a, b, c), (a, c, d)]

    def nearest(x, z):
        return min(range(len(verts)), key=lambda k: (math.hypot(verts[k][0] - x, verts[k][2] - z), k))

    marks = {n: (verts[nearest(*xz)][0], verts[nearest(*xz)][2]) for n, xz in targets.items()}
    return verts, faces, (nearest(*pin_t[0]), nearest(*pin_t[1])), marks


def build(kind, **params):
    """Return (verts [(x, y, z)], faces [(a, b, c)] 0-based, pins (left_id, right_id))."""
    return build_full(kind, **params)[:3]


def mesh_stats(verts, faces):
    """Return (zero-area triangle count, connected component count)."""
    degenerate, parent = 0, list(range(len(verts)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for f in faces:
        (ax, _, az), (bx, _, bz), (cx, _, cz) = (verts[k] for k in f)
        if abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) < 1e-12:
            degenerate += 1
        parent[find(f[0])] = parent[find(f[1])] = find(f[2])
    return degenerate, len({find(k) for k in range(len(verts))})


def write_obj(path, verts, faces):
    with open(path, "w") as f:
        for x, y, z in verts:
            f.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")
        for a, b, c in faces:
            f.write(f"f {a + 1} {b + 1} {c + 1}\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kind", choices=sorted(DEFAULTS), required=True)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    verts, faces, pins, marks = build_full(args.kind)
    out = args.out or f"sim/out/{args.kind}.obj"
    import os
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    write_obj(out, verts, faces)
    deg, comps = mesh_stats(verts, faces)
    xs, zs = [v[0] for v in verts], [v[2] for v in verts]
    print(f"kind={args.kind} vertices={len(verts)} triangles={len(faces)} pins={pins[0]},{pins[1]} "
          f"mass={DEFAULTS[args.kind]['mass']} kg degenerate={deg} components={comps} out={out}")
    print(f"bbox x[{min(xs):.3f}, {max(xs):.3f}] z[{min(zs):.3f}, {max(zs):.3f}]")
    for n, (x, z) in marks.items():
        print(f"  landmark {n}: x={x:.3f} z={z:.3f}")

if __name__ == "__main__":
    main()
