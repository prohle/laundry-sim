"""Laundry check harness: named checks, one line each, exit 1 if any fails. No network, no disk frames."""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import sys
import tempfile
import time

import mujoco
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arms
import garment
import scene

TMP = tempfile.TemporaryDirectory()  # the flexcomp needs an OBJ on disk; it is deleted on exit
STEPS = 200
_cache = {}


def width(kind):
    v = garment.build(kind)[0]
    return max(p[0] for p in v) - min(p[0] for p in v)


def xml(kind="towel"):
    verts, faces, _ = garment.build(kind)
    path = os.path.join(TMP.name, f"{kind}.obj")
    garment.write_obj(path, verts, faces)
    return scene.build(path, kind)


def model(kind="towel"):
    if kind not in _cache:
        _cache[kind] = mujoco.MjModel.from_xml_string(xml(kind))
    return _cache[kind]


def settle(seed):
    """Run STEPS from a fresh state. The scene has no randomness yet, so seed only names the run."""
    np.random.seed(seed)
    m = model()
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    for _ in range(STEPS):
        mujoco.mj_step(m, d)
    return m, d, np.array(d.flexvert_xpos)


def garment_ok(kind):
    v, f, pins = garment.build(kind)
    assert len(v) > 100, f"{len(v)} vertices"
    assert len(f) > 100, f"{len(f)} faces"
    assert len(pins) == 2 and all(0 <= p < len(v) for p in pins), f"pins {pins} out of range {len(v)}"


def c_tee():
    garment_ok("tee")
    assert width("tee") > width("towel"), f"tee {width('tee'):.3f} <= towel {width('towel'):.3f}"


def c_scene_loads():
    model()


def c_scene_parts():
    m = model()
    for kind, names in (("GEOM", ["back", "left", "right", "top", "bottom", "shelf"]),
                        ("CAMERA", ["inside", "top"])):
        for n in names:
            assert mujoco.mj_name2id(m, getattr(mujoco.mjtObj, f"mjOBJ_{kind}"), n) >= 0, f"no {kind.lower()} '{n}'"


def c_on_shelf():
    _, _, p = settle(0)
    assert not np.isnan(p).any(), "NaN in flexvert_xpos"
    lo, hi = p[:, 2].min(), p[:, 2].max()
    assert 0.55 <= lo and hi <= 0.62, f"z-range [{lo:.3f}, {hi:.3f}] outside [0.55, 0.62]"


def c_render():
    m, d, _ = settle(0)
    r = mujoco.Renderer(m, height=720, width=1280)
    try:
        r.update_scene(d, camera="inside")
        img = r.render()
    finally:
        r.close()
    assert img.shape == (720, 1280, 3), f"shape {img.shape}"
    n = len(np.unique(img.reshape(-1, 3), axis=0))
    assert n > 1, f"flat frame, {n} distinct colour"


def c_deterministic():
    a, b = settle(7)[2], settle(7)[2]
    da = (a[:, 2].min() - b[:, 2].min(), a[:, 2].max() - b[:, 2].max())
    assert max(abs(x) for x in da) < 1e-6, f"z-range differs by {da}"


def c_arms_present():
    m = model()
    for s in arms.SIDES:
        for k in arms.HINGES:
            j = m.joint(f"arm_{s}_{k}")
            assert j.type[0] == mujoco.mjtJoint.mjJNT_HINGE, f"arm_{s}_{k} is not a hinge"
        for k in ("grip", "grip2"):
            j = m.joint(f"arm_{s}_{k}")
            assert j.type[0] == mujoco.mjtJoint.mjJNT_SLIDE, f"arm_{s}_{k} is not a slide"
        m.actuator(f"arm_{s}_grip")


def c_arms_ready():
    m = model()
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    ctrl, cs = arms.ready_pose(m, d)
    arms.apply(m, d, ctrl)
    for _ in range(STEPS):
        mujoco.mj_step(m, d)
    for s, c in zip(arms.SIDES, cs):
        p = arms.pinch(m, d, s)
        dist = np.linalg.norm(p - c)
        assert dist <= 0.08, f"arm_{s} pinch {dist:.3f} m from its corner (limit 0.08)"
        assert p[2] > 0.58, f"arm_{s} pinch z {p[2]:.3f} <= 0.58"


CHECKS = [("garment-towel", lambda: garment_ok("towel")), ("garment-tee", c_tee),
          ("scene-loads", c_scene_loads), ("scene-parts", c_scene_parts),
          ("garment-on-shelf", c_on_shelf), ("render", c_render), ("deterministic", c_deterministic),
          ("arms-present", c_arms_present), ("arms-ready", c_arms_ready)]


def main():
    t0, failed = time.time(), 0
    for name, fn in CHECKS:
        try:
            fn()
            print(f"PASS  {name}")
        except Exception as e:  # noqa: BLE001 - any failure is a failed check
            failed += 1
            print(f"FAIL  {name}: {type(e).__name__}: {e}")
    print(f"VERDICT: {'FAIL' if failed else 'PASS'} ({len(CHECKS)} checks, {failed} failed, {time.time() - t0:.1f}s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
