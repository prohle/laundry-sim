"""Scripted fold of the towel, front edge over back, along y. Simulated; the grasp is kinematic.

Grasp (version 1): after every mj_step the qpos entries of the vertices near each front corner are
pulled toward that gripper's pinch point, q += ALPHA * (target - q), each step clamped to MAX_STEP.
Flex vertex i has three slide dofs (world x, y, z) at qpos[adr + 3 * (vertadr + i)], where adr is
the qpos address of the first flex joint (12 here: the arms come first). q is the displacement
from the vertex's reference position, so the target is converted: q_target = target - ref.
No arm-cloth contact is enabled.
"""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import sys

import mujoco
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arms
import garment

ALPHA = 0.35          # fraction of the remaining distance closed per step
MAX_STEP = 0.02       # per-step cap on a grasped vertex, metres
GRASP_RADIUS = 0.12   # vertices within this xy distance of a corner are held (corner row only)
Z_LIFT, Z_DOWN = 0.72, 0.62  # 0.78 puts the elbow past its limit when the pinch passes under the shoulder
Y_FOLD = -0.05        # pinch y at the far side; the towel spans y -0.15..0.25, so 0.18 would not fold it. -0.10 is past the elbow limit
SETTLE = 200          # not counted in the ~550 fold steps
RATIO_MAX, OVERLAP_MIN = 0.6, 0.6
TRACE_EVERY = 25


def qpos_adr(m):
    """qpos address of flex vertex 0's first dof, and the number of flex vertices."""
    b = m.flex_vertbodyid[m.flex_vertadr[0]]
    return int(m.jnt_qposadr[m.body_jntadr[b]]), int(m.flex_vertnum[0])


def metrics(y0, y1, ymid, half_low):
    """y-extent before/after, ratio, and overlap of the two halves' y-intervals after the fold."""
    before, after = y0.max() - y0.min(), y1.max() - y1.min()
    a, b = y1[half_low], y1[~half_low]
    overlap = max(0.0, min(a.max(), b.max()) - max(a.min(), b.min())) / min(a.max() - a.min(), b.max() - b.min())
    return before, after, after / before, overlap


def run(m, trace=None, render=None):
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    adr, n = qpos_adr(m)
    sl = slice(adr, adr + 3 * n)
    dof0 = int(m.jnt_dofadr[m.body_jntadr[m.flex_vertbodyid[m.flex_vertadr[0]]]])
    ctrl, cs = arms.ready_pose(m, d)
    arms.apply(m, d, ctrl)
    for _ in range(SETTLE):
        mujoco.mj_step(m, d)
    pos0 = np.array(d.flexvert_xpos)
    ref = pos0 - d.qpos[sl].reshape(n, 3)          # position at q = 0
    ymid = (pos0[:, 1].min() + pos0[:, 1].max()) / 2
    half_low = pos0[:, 1] < ymid                   # back half stays; front half is carried over

    held = []                                      # (side, vertex indices, xy offsets from pinch)
    for side, c in zip(arms.SIDES, cs):
        p = arms.pinch(m, d, side)
        idx = np.where((np.hypot(pos0[:, 0] - c[0], pos0[:, 1] - c[1]) <= GRASP_RADIUS) & (pos0[:, 1] > ymid))[0]
        held.append((side, idx, pos0[idx, :2] - p[:2]))

    tip = {s: arms.pinch(m, d, s) for s in arms.SIDES}
    state = {"step": 0, "grip": arms.GRIP_OPEN, "grasp": False, "nan": False, "tear": 0.0}
    verts, faces, _ = garment.build("towel")
    e = np.array(sorted({tuple(sorted((f[i], f[(i + 1) % 3]))) for f in faces for i in range(3)}))
    # flex vertex order equals OBJ order for this mesh; edge rest lengths from the OBJ
    vv = np.array(verts)
    rest = np.linalg.norm(vv[e[:, 0]] - vv[e[:, 1]], axis=1)

    def step(target):
        for s in arms.SIDES:
            for k, v in arms.ik(s, target[s]).items():
                d.ctrl[m.actuator(f"arm_{s}_{k}").id] = v
            d.ctrl[m.actuator(f"arm_{s}_grip").id] = state["grip"]
        mujoco.mj_step(m, d)
        if state["grasp"]:
            q = d.qpos[sl].reshape(n, 3)
            for side, idx, off in held:
                p = arms.pinch(m, d, side)
                want = np.column_stack([p[0] + off[:, 0], p[1] + off[:, 1], np.full(len(idx), p[2])]) - ref[idx]
                dq = ALPHA * (want - q[idx])
                norm = np.linalg.norm(dq, axis=1, keepdims=True)
                q[idx] += dq * np.minimum(1.0, MAX_STEP / np.maximum(norm, 1e-12))
                d.qvel[dof0:dof0 + 3 * n].reshape(n, 3)[idx] = 0.0
            d.qpos[sl] = q.ravel()
        mujoco.mj_forward(m, d)
        state["step"] += 1
        pos = np.array(d.flexvert_xpos)
        if np.isnan(pos).any():
            state["nan"] = True
        if trace is not None and state["step"] % TRACE_EVERY == 0:
            trace.append((state["step"], pos[:, 1].max() - pos[:, 1].min()))

    def move(goal, steps):
        start = {s: tip[s].copy() for s in arms.SIDES}
        for i in range(1, steps + 1):
            t = i / steps
            cur = {s: start[s] + t * (goal[s] - start[s]) for s in arms.SIDES}
            step(cur)
            if state["nan"]:
                return
        for s in arms.SIDES:
            tip[s] = goal[s].copy()

    def at(z=None, y=None):
        out = {}
        for s in arms.SIDES:
            t = tip[s].copy()
            if z is not None: t[2] = z
            if y is not None: t[1] = y
            out[s] = t
        return out

    state["grip"] = 0.0; state["grasp"] = True
    move(at(), 50)                                  # 2 close, settle
    move(at(z=Z_LIFT), 150)                         # 3 lift
    move(at(y=Y_FOLD), 200)                         # 4 carry over
    move(at(z=Z_DOWN), 100)                         # 5 lower
    state["grip"] = arms.GRIP_OPEN; state["grasp"] = False
    move(at(z=Z_LIFT), 50)                          # 6 release, retract
    for _ in range(100):                            # let the cloth settle
        step(tip)

    pos = np.array(d.flexvert_xpos)
    stretch = float((np.linalg.norm(pos[e[:, 0]] - pos[e[:, 1]], axis=1) / rest).max())
    res = dict(zip(("before", "after", "ratio", "overlap"), metrics(pos0[:, 1], pos[:, 1], ymid, half_low)))
    res.update(nan=state["nan"], stretch=stretch)
    res["folded"] = (not state["nan"]) and res["ratio"] <= RATIO_MAX and res["overlap"] >= OVERLAP_MIN
    if render:
        r = mujoco.Renderer(m, height=720, width=1280)
        r.update_scene(d, camera="inside")
        render(r.render())
        r.close()
    return res


def main():
    import tempfile
    from PIL import Image
    import scene
    verts, faces, _ = garment.build("towel")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
    os.makedirs(out, exist_ok=True)
    obj = os.path.join(tempfile.mkdtemp(), "towel.obj")
    garment.write_obj(obj, verts, faces)
    m = mujoco.MjModel.from_xml_string(scene.build(obj, "towel"))
    trace = []
    r = run(m, trace, lambda img: Image.fromarray(img).save(os.path.join(out, "fold.png")))
    with open(os.path.join(out, "fold_trace.txt"), "w") as f:
        f.write("step y_extent\n" + "".join(f"{s} {y:.3f}\n" for s, y in trace))
    print(f"y-extent before: {r['before']:.3f}\ny-extent after:  {r['after']:.3f}\n"
          f"ratio:           {r['ratio']:.2f}\noverlap:         {r['overlap']:.2f}\n"
          f"max edge stretch: {r['stretch']:.2f}  nan: {r['nan']}  alpha: {ALPHA}  max step: {MAX_STEP}")
    print("FOLDED" if r["folded"] else "NOT FOLDED")
    return 0 if r["folded"] else 1


if __name__ == "__main__":
    sys.exit(main())
