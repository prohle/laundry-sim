"""Load the cabinet scene, step it, render one frame."""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import argparse
import sys

import mujoco
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import garment
import scene


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--frames", type=int, default=1)
    ap.add_argument("--camera", choices=["inside", "top"], default="inside")
    ap.add_argument("--garment", choices=["towel", "tee"], default="towel")
    ap.add_argument("--out", default="sim/out/frame.png")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()

    obj = f"sim/out/{a.garment}.obj"
    if not os.path.exists(obj):
        verts, faces, _ = garment.build(a.garment)
        os.makedirs(os.path.dirname(obj), exist_ok=True)
        garment.write_obj(obj, verts, faces)

    model = mujoco.MjModel.from_xml_string(scene.build(obj, a.garment))
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    z0 = np.array(data.flexvert_xpos)[:, 2]
    print(f"z-range before settling: [{z0.min():.3f}, {z0.max():.3f}]")
    steps = 200  # settle
    for _ in range(steps):
        mujoco.mj_step(model, data)

    pos = np.array(data.flexvert_xpos)
    if np.isnan(pos).any():
        print("FAIL: NaN in flexvert_xpos")
        return 1

    r = mujoco.Renderer(model, height=720, width=1280)
    r.update_scene(data, camera=a.camera)
    img = r.render()
    r.close()
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    Image.fromarray(img).save(a.out)

    print(f"garment={a.garment} vertices={model.nflexvert} triangles={model.flex_elemnum[0]} "
          f"steps={steps} z=[{pos[:, 2].min():.3f}, {pos[:, 2].max():.3f}] "
          f"x=[{pos[:, 0].min():.3f}, {pos[:, 0].max():.3f}] frame={a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
