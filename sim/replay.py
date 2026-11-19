"""Export one garment's arms half fold as a JSON the browser can replay (task 10.1).

Every number is recorded from the MuJoCo run (fold.run); nothing is animated. Simulated, not a physical fold.
Units: metres, radians, seconds. Box/cylinder `size` is MuJoCo's half-extents (cylinder: radius, half-height).
Frames: one every K = STEPS_PER_FRAME simulation steps (dt 0.004 s), played back at `fps`.
Layout: `static` = world-fixed geoms (cabinet, board, flaps, rim, bar); `chain` = the arm bodies, each with its
pose relative to its parent, its joint (name, axis; the joint sits at the body origin) and its geoms;
`joints` + `angles` = the 8 arm hinges per frame; `grip` = the two finger openings per frame (finger_b mirrors
finger_a through an equality constraint); `cloth` = every vertex per frame; `faces` = the triangles.
"""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import json
import sys
import tempfile

import mujoco
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import arms
import fold
import garment
import scene

STEPS_PER_FRAME = 4   # K: 0.016 s of simulated time per frame
FPS = 30              # playback: 0.48 x real time
JOINTS = [f"arm_{s}_{k}" for s in arms.SIDES for k in arms.HINGES]
GRIPS = [f"arm_{s}_grip" for s in arms.SIDES]
KINDS = ("towel", "tee", "pants", "shorts", "dress")


def _r(a, n=4):
    return np.round(np.asarray(a, dtype=float), n).tolist()


def _name(m, kind, i):
    return mujoco.mj_id2name(m, kind, i)


def _geom(m, i, local):
    t = int(m.geom_type[i])
    if t not in (mujoco.mjtGeom.mjGEOM_BOX, mujoco.mjtGeom.mjGEOM_CYLINDER):
        return None
    g = dict(name=_name(m, mujoco.mjtObj.mjOBJ_GEOM, i),
             type="box" if t == mujoco.mjtGeom.mjGEOM_BOX else "cylinder",
             pos=_r(m.geom_pos[i] if local else 0), size=_r(m.geom_size[i][:3 if t == mujoco.mjtGeom.mjGEOM_BOX else 2]),
             rgba=_r(m.geom_rgba[i], 3))
    if t == mujoco.mjtGeom.mjGEOM_CYLINDER:
        g["axis"] = "z"
    if int(m.geom_group[i]) == 3:
        g["hidden"] = True
    return g


def static_and_chain(m, d):
    static, chain = [], []
    for i in range(m.ngeom):
        b = int(m.geom_bodyid[i])
        if _name(m, mujoco.mjtObj.mjOBJ_BODY, b).startswith("arm_") or not _name(m, mujoco.mjtObj.mjOBJ_GEOM, i):
            continue
        g = _geom(m, i, False)
        if g is None:
            continue
        if not np.allclose(d.geom_xmat[i], np.eye(3).ravel(), atol=1e-6):
            raise RuntimeError(f"static geom {g['name']} is rotated; the format has no rotation for it")
        g["pos"] = _r(d.geom_xpos[i])
        g["body"] = _name(m, mujoco.mjtObj.mjOBJ_BODY, b)
        static.append(g)
    for b in range(m.nbody):
        n = _name(m, mujoco.mjtObj.mjOBJ_BODY, b)
        if not n.startswith("arm_"):
            continue
        ent = dict(body=n, parent=_name(m, mujoco.mjtObj.mjOBJ_BODY, int(m.body_parentid[b])),
                   pos=_r(m.body_pos[b]), quat=_r(m.body_quat[b], 6), joint=None, axis=None)
        if m.body_jntnum[b]:
            j = int(m.body_jntadr[b])
            ent["joint"] = _name(m, mujoco.mjtObj.mjOBJ_JOINT, j)
            ent["axis"] = _r(m.jnt_axis[j], 3)
            ent["range"] = _r(m.jnt_range[j])
            ent["joint_type"] = "hinge" if m.jnt_type[j] == mujoco.mjtJoint.mjJNT_HINGE else "slide"
        ent["geoms"] = [g for i in range(m.ngeom) if m.geom_bodyid[i] == b and (g := _geom(m, i, True))]
        chain.append(ent)
    return static, chain


def phases(kind, kw):
    """Named step ranges (1-based simulation steps), from the same constants fold.run uses."""
    seq = []
    if kind == "towel":
        seq = [("close", 50), ("lift", 150), ("inward", 50), ("carry", 200), ("lower", 100), ("release", 50), ("settle", 100)]
    else:
        st = kw["program"][0]
        seq = [("close", 50), ("lift", 150)] + ([("inward", 50)] if st.get("inward") else []) + [("carry", 200), ("lower", 100), ("release", 50), ("settle", st.get("settle", 100))]
    out, s = [], 0
    for n, k in seq:
        out.append(dict(name=n, start_step=s + 1, end_step=s + k, start_frame=s // STEPS_PER_FRAME))
        s += k
    return out, s


def export(kind):
    verts, faces, _ = garment.build(kind)
    obj = os.path.join(tempfile.mkdtemp(), kind + ".obj")
    garment.write_obj(obj, verts, faces)
    m = mujoco.MjModel.from_xml_string(scene.build(obj, kind))
    kw = {} if kind == "towel" else fold.half_fold_kwargs(m, kind)
    qadr = [int(m.joint(j).qposadr[0]) for j in JOINTS]
    gadr = [int(m.joint(j).qposadr[0]) for j in GRIPS]
    angles, grip, cloth, steps = [], [], [], []
    keep = []

    def grab(d):
        angles.append(_r(d.qpos[qadr]))
        grip.append(_r(d.qpos[gadr], 5))
        cloth.append(_r(d.flexvert_xpos))

    def on_step(d, step):
        steps.append(step)
        if (step - 1) % STEPS_PER_FRAME == 0:
            grab(d)
            on_step.last = step

    on_step.last = 0
    r = fold.run(m, on_step=on_step, keep=keep, **kw)
    if on_step.last != steps[-1]:
        grab(keep[0])                                   # the last step is always the last frame
    ph, planned = phases(kind, kw)
    if planned != steps[-1]:
        raise RuntimeError(f"phase table covers {planned} steps, the run took {steps[-1]}")

    d0 = mujoco.MjData(m)
    mujoco.mj_forward(m, d0)
    static, chain = static_and_chain(m, d0)
    log = [dict(step=s["name"], ok=s["ok"], **s["numbers"]) for s in r.get("steps", [])]
    wmin = fold.WIDTH_MIN if kind == "towel" else fold.TEE_WIDTH_MIN
    tmin = fold.TOP_MIN if kind == "towel" else fold.TEE_TOP_MIN
    whole = dict(width=r["x1"] / r["x0"], width_min=wmin, depth=r["y1"] / r["y0"], depth_max=fold.DEPTH_MAX,
                 on_top_mm=(r["z_moved"] - r["z_still"]) * 1000, on_top_min_mm=tmin * 1000,
                 x0=r["x0"], x1=r["x1"], y0=r["y0"], y1=r["y1"],
                 width_ok=bool(r["width_ok"]), depth_ok=bool(r["depth_ok"]), top_ok=bool(r["top_ok"]))
    if log:
        log[-1].update(whole)                           # the half fold is one step; the whole-garment numbers belong to it
    else:
        log = [dict(step="fold_half", ok=bool(r["folded"]), **whole)]
    for e in log:
        for k, v in list(e.items()):
            if isinstance(v, float):
                e[k] = round(v, 4)
    doc = dict(
        kind=kind, simulated=True, frames=len(angles), vertices=len(cloth[0]), fps=FPS, dt=float(m.opt.timestep),
        steps_per_frame=STEPS_PER_FRAME, sim_steps=steps[-1], sim_seconds=round(steps[-1] * m.opt.timestep, 3),
        units="m, rad, s", size_is="half-extents", folded=bool(r["folded"]),
        summary=dict(laid_flat=_r([r["x0"], r["y0"]]), folded_size=_r([r["x1"], r["y1"]]), verdict="FOLDED" if r["folded"] else "NOT FOLDED"),
        phases=ph, static=static, chain=chain, joints=JOINTS, angles=angles, grip_joints=GRIPS, grip=grip,
        cloth=cloth, faces=[list(map(int, f)) for f in faces], cloth_rgba=_r(m.flex_rgba[0], 3) if hasattr(m, "flex_rgba") else [0.2, 0.45, 0.8, 1],
        log=log)
    return doc


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--garment", choices=KINDS, default="tee")
    a = ap.parse_args()
    doc = export(a.garment)
    text = json.dumps(doc, separators=(",", ":"), allow_nan=False)   # allow_nan=False raises on any NaN/inf
    paths = [os.path.join(HERE, "out", f"replay-{a.garment}.json"), os.path.join(HERE, "..", "public", f"replay-{a.garment}.json")]
    for p in paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)
    print(f"{a.garment}: frames {doc['frames']}  vertices {doc['vertices']}  K {STEPS_PER_FRAME}  "
          f"sim {doc['sim_seconds']} s  {len(text.encode())} bytes  {'FOLDED' if doc['folded'] else 'NOT FOLDED'} (simulated)")
    for p in paths:
        print(os.path.normpath(p))
    return 0 if doc["folded"] else 1


if __name__ == "__main__":
    sys.exit(main())
