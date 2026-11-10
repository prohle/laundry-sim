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


def main():
    t0 = time.time()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "fold.mp4")
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
        # evenly spaced over the whole trajectory: frame k is taken at step ceil((k+1) * TOTAL / FRAMES)
        if n[0] < FRAMES and step * FRAMES >= (n[0] + 1) * fold.TOTAL_STEPS:
            rr.update_scene(d, camera="inside")
            ff.stdin.write(rr.render().tobytes())
            n[0] += 1

    r = fold.run(m, on_step=on_step)
    ff.stdin.close()
    rc = ff.wait()
    rr.close()
    sim_s = fold.TOTAL_STEPS * m.opt.timestep
    print(f"frames {n[0]}  simulated {sim_s:.2f} s  wall-clock {time.time() - t0:.1f} s  "
          f"{out}  {os.path.getsize(out)} bytes  (simulated; {'FOLDED' if r['folded'] else 'NOT FOLDED'})")
    return 0 if rc == 0 and n[0] == FRAMES else 1


if __name__ == "__main__":
    sys.exit(main())
