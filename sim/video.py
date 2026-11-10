"""Render the scripted fold (fold.run) to sim/out/fold.mp4: 120 frames, 30 fps, 1280x720, `inside` camera.
Frames are piped to ffmpeg as raw RGB; nothing is written to disk first. Simulated, not a physical fold."""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import subprocess
import sys
import tempfile
import time

import mujoco

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fold
import garment
import scene

W, H, FPS, FRAMES = 1280, 720, 30, 120


def render(out, frames=FRAMES):
    """Render the scripted fold to `out` with `frames` evenly spaced frames. Returns (frames written, fold result, wall s)."""
    t0 = time.time()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    verts, faces, _ = garment.build("towel")
    obj = os.path.join(tempfile.mkdtemp(), "towel.obj")
    garment.write_obj(obj, verts, faces)
    m = mujoco.MjModel.from_xml_string(scene.build(obj, "towel"))
    rr = mujoco.Renderer(m, height=H, width=W)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", out],
        stdin=subprocess.PIPE)
    n = [0]

    def on_step(d, step):
        # evenly spaced over the whole trajectory: frame k is taken at step ceil((k+1) * TOTAL / frames)
        if n[0] < frames and step * frames >= (n[0] + 1) * fold.TOTAL_STEPS:
            rr.update_scene(d, camera="inside")
            ff.stdin.write(rr.render().tobytes())
            n[0] += 1

    r = fold.run(m, on_step=on_step)
    ff.stdin.close()
    rc = ff.wait()
    rr.close()
    if rc != 0:
        raise RuntimeError("ffmpeg failed")
    return n[0], r, time.time() - t0, m.opt.timestep


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "fold.mp4")
    n, r, wall, dt = render(out)
    sim_s = fold.TOTAL_STEPS * dt
    print(f"frames {n}  simulated {sim_s:.2f} s  wall-clock {wall:.1f} s  "
          f"{out}  {os.path.getsize(out)} bytes  (simulated; {'FOLDED' if r['folded'] else 'NOT FOLDED'})")
    return 0 if n == FRAMES else 1


if __name__ == "__main__":
    sys.exit(main())
