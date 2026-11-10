"""Parametric garments (towel, tee) as triangle meshes in the XZ plane (y = 0).

Generated, never downloaded. Lattice vertices are shared between cells, so the mesh is welded by
construction. Coordinates: x across, z up, garment top edge at z = H.
Tee: body spans x in [0, W]; sleeves extend to x < 0 and x > W, from the top down to `sleeve_depth`.
Pins are the two vertices nearest to (0, H - sleeve_depth) and (W, H - sleeve_depth).
For the towel the same rule applies with depth 0: the two top corners.
"""
import argparse
import math

DEFAULTS = {
    "towel": dict(width=0.70, height=0.40, cell=0.035, mass=0.48),
    "tee": dict(width=0.50, height=0.70, sleeve=0.22, sleeve_depth=0.18, cell=0.035, mass=0.30),
}


def build(kind, **params):
    """Return (verts [(x, y, z)], faces [(a, b, c)] 0-based, pins (left_id, right_id))."""
    if kind not in DEFAULTS:
        raise ValueError(f"unknown kind {kind!r}")
    p = {**DEFAULTS[kind], **params}
    W, H, cell = p["width"], p["height"], p["cell"]
    sleeve = p.get("sleeve", 0.0) if kind == "tee" else 0.0
    depth = p.get("sleeve_depth", 0.0) if kind == "tee" else 0.0

    nw, nh = max(1, round(W / cell)), max(1, round(H / cell))
    ns = round(sleeve / cell) if sleeve else 0
    nd = min(nh, round(depth / cell)) if depth else 0
    dx, dz = W / nw, H / nh

    # Cells (i, j): body, plus sleeve cells in the top `nd` rows.
    cells = [(i, j) for i in range(nw) for j in range(nh)]
    if ns and nd:
        sleeve_i = list(range(-ns, 0)) + list(range(nw, nw + ns))
        cells += [(i, j) for i in sleeve_i for j in range(nh - nd, nh)]
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

    pz = H - nd * dz
    return verts, faces, (nearest(0.0, pz), nearest(W, pz))


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
    verts, faces, pins = build(args.kind)
    out = args.out or f"sim/out/{args.kind}.obj"
    import os
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    write_obj(out, verts, faces)
    print(f"kind={args.kind} vertices={len(verts)} triangles={len(faces)} "
          f"pins={pins[0]},{pins[1]} mass={DEFAULTS[args.kind]['mass']} kg out={out}")


if __name__ == "__main__":
    main()
