"""Property-based tests (Hypothesis) for the simulated garments and the scripted fold. Task 6.4.

Run: sim/.venv/bin/python sim/test_props.py. One line per property, then a verdict; exit 0 only if all pass.
The two fold properties run the full fold, so they are capped to 3 seeds (max_examples=3).
"""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import sys
import tempfile
import time

import mujoco
import numpy as np
from hypothesis import HealthCheck, given, settings, strategies as st

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eval as E
import garment
import program
import scene

TMP = tempfile.TemporaryDirectory()
KINDS = sorted(garment.DEFAULTS)
COUNT = {}


def prop(name, n=20):
    """Wrap a test body: count examples, no deadline, fixed example budget."""
    def deco(fn):
        def counted(*a, **kw):
            COUNT[name] = COUNT.get(name, 0) + 1
            return fn(*a, **kw)
        counted.__name__ = name
        return settings(max_examples=n, deadline=None, database=None, derandomize=True,
                        suppress_health_check=list(HealthCheck))(counted)
    return deco


mesh_args = dict(kind=st.sampled_from(KINDS), cell=st.floats(0.02, 0.06))


@given(**mesh_args)
@prop("garment_vertex_count")
def garment_vertex_count(kind, cell):
    v, f, _ = garment.build(kind, cell=cell)
    deg, _ = garment.mesh_stats(v, f)
    assert len(v) > 50, f"{kind} cell {cell:.4f}: {len(v)} vertices"
    assert deg == 0, f"{kind} cell {cell:.4f}: {deg} degenerate triangles"


@given(**mesh_args)
@prop("garment_single_component")
def garment_single_component(kind, cell):
    v, f, _ = garment.build(kind, cell=cell)
    _, comps = garment.mesh_stats(v, f)
    assert comps == 1, f"{kind} cell {cell:.4f}: {comps} components"


def towel_model(seed):
    """Towel dropped with the evaluation's seeded offsets (yaw 0)."""
    yaw, dx, dy = E.drop(np.random.default_rng(seed))
    obj = os.path.join(TMP.name, "towel.obj")
    E.posed_obj(obj, yaw, dx, dy)
    return mujoco.MjModel.from_xml_string(scene.build(obj, "towel"))


@given(seed=st.integers(0, 50))
@prop("no_nan")
def no_nan(seed):
    m = towel_model(seed)
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    for _ in range(50):
        mujoco.mj_step(m, d)
    p = np.array(d.flexvert_xpos)
    assert not np.isnan(p).any(), f"seed {seed}: NaN"
    assert 0.0 <= p[:, 2].min() and p[:, 2].max() <= 2.0, f"seed {seed}: z [{p[:, 2].min():.3f}, {p[:, 2].max():.3f}]"


_folds = {}


def fold_seed(seed, tag=0):
    """Full scripted fold on the seeded drop: (trace of (step, y-extent), (x-extent, y-extent, mean z))."""
    if (seed, tag) not in _folds:
        m = towel_model(seed)
        d = mujoco.MjData(m)
        mujoco.mj_forward(m, d)
        cs = E.front_corners(np.array(d.flexvert_xpos))
        tr = []
        r = program.run_program(m, program.towel_program(None), corners=cs, trace=tr)
        z = (r["z_moved"] + r["z_still"]) / 2        # mean of the two halves' mean z
        _folds[(seed, tag)] = (tr, (r["x1"], r["y1"], z))
    return _folds[(seed, tag)]


@given(seed=st.sampled_from([1, 2, 3]))
@prop("extent_monotone", 3)
def extent_monotone(seed):
    tr, _ = fold_seed(seed)
    ys = [y for _, y in tr]
    assert len(ys) > 2, f"seed {seed}: trace of {len(ys)} samples"
    worst = max(b - a for a, b in zip(ys, ys[1:]))
    assert worst <= 0.02, f"seed {seed}: y-extent grew {worst * 100:.1f} cm between samples"


@given(seed=st.sampled_from([1, 2, 3]))
@prop("deterministic", 3)
def deterministic(seed):
    a, b = fold_seed(seed, 0)[1], fold_seed(seed, 1)[1]
    assert np.allclose(a, b, atol=1e-9, rtol=0), f"seed {seed}: {a} != {b}"


def main():
    failed = 0
    t0 = time.time()
    for fn in (garment_vertex_count, garment_single_component, no_nan, extent_monotone, deterministic):
        name, t = fn.hypothesis.inner_test.__name__, time.time()
        try:
            fn()
            print(f"PASS  {name}  ({COUNT.get(name, 0)} examples, {time.time() - t:.1f}s)")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {name}: {type(e).__name__}: {str(e).splitlines()[0] if str(e) else ''}")
    print(f"VERDICT: {'FAIL' if failed else 'PASS'} (5 properties, {sum(COUNT.values())} examples, {failed} failed, {time.time() - t0:.1f}s)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
