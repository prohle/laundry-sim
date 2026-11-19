"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Geom = { type: string; pos: number[]; size: number[]; rgba: number[]; quat?: number[] };
type Link = {
  body: string; parent: string; pos: number[]; quat: number[];
  joint: string | null; axis: number[] | null; joint_type?: string; geoms: Geom[];
};
type Log = {
  step: string; ok: boolean; width: number; width_min: number; depth: number; depth_max: number;
  on_top_mm: number; on_top_min_mm: number;
};
type Replay = {
  frames: number; fps: number; sim_seconds: number;
  summary: { laid_flat: number[]; folded_size: number[]; verdict: string };
  phases: { name: string; start_frame: number }[];
  static: (Geom & { name: string; hidden?: boolean })[];
  chain: Link[]; joints: string[]; angles: number[][]; grip_joints: string[]; grip: number[][];
  cloth: number[][][]; faces: number[][]; cloth_rgba: number[]; log: Log[];
};

const color = (c: number[]) => new THREE.Color(c[0], c[1], c[2]);
const quat = (q: number[]) => new THREE.Quaternion(q[1], q[2], q[3], q[0]); // MuJoCo wxyz

function mesh(g: Geom): THREE.Mesh {
  let geo: THREE.BufferGeometry;
  if (g.type === "cylinder") {
    geo = new THREE.CylinderGeometry(g.size[0], g.size[0], g.size[1] * 2, 24).rotateX(Math.PI / 2);
  } else {
    geo = new THREE.BoxGeometry(g.size[0] * 2, g.size[1] * 2, g.size[2] * 2);
  }
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color(g.rgba), roughness: 0.8 }));
  m.position.set(g.pos[0], g.pos[1], g.pos[2]);
  if (g.quat) m.quaternion.copy(quat(g.quat));
  return m;
}

export default function ReplayPlayer({ kind }: { kind: string }) {
  const box = useRef<HTMLDivElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const playBtn = useRef<HTMLButtonElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const playing = useRef(true);
  const frame = useRef(0);
  const [data, setData] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let dead = false;
    let raf = 0;
    let cleanup = () => {};
    setData(null);
    setError(null);
    fetch(`${base}/replay-${kind}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`no replay for ${kind} (${r.status})`);
        return r.json() as Promise<Replay>;
      })
      .then((d) => {
        if (dead) return;
        setData(d);
        // MuJoCo is z-up, three.js is y-up: one root rotation maps (x, y, z) -> (x, z, -y).
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x15171a);
        const root = new THREE.Group();
        root.rotation.x = -Math.PI / 2;
        scene.add(root);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.6));
        const sun = new THREE.DirectionalLight(0xffffff, 1.8);
        sun.position.set(1, 3, -1);
        scene.add(sun);

        for (const s of d.static) if (!s.hidden) {
          const m = mesh(s);
          root.add(m);
        }

        // Arm hierarchy: body frame (pos, quat), then a joint group carrying the motion.
        const bodies = new Map<string, THREE.Group>();
        const motion = new Map<string, { g: THREE.Group; axis: THREE.Vector3; slide: boolean }>();
        for (const c of d.chain) {
          const frameG = new THREE.Group();
          frameG.position.set(c.pos[0], c.pos[1], c.pos[2]);
          frameG.quaternion.copy(quat(c.quat));
          const jointG = new THREE.Group();
          frameG.add(jointG);
          for (const g of c.geoms) jointG.add(mesh(g));
          (bodies.get(c.parent)?.children[0] ?? root).add(frameG);
          bodies.set(c.body, frameG);
          if (c.joint && c.axis)
            motion.set(c.joint, { g: jointG, axis: new THREE.Vector3(...c.axis), slide: c.joint_type === "slide" });
        }

        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(d.cloth[0].length * 3);
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setIndex(d.faces.flat());
        const cloth = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({ color: color(d.cloth_rgba), side: THREE.DoubleSide, roughness: 0.9 }),
        );
        cloth.frustumCulled = false;
        root.add(cloth);

        const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 20);
        camera.position.set(0.6, 1.5, -1.9);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        el.appendChild(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0.6, 0.8, -0.05);
        controls.update();

        const resize = () => {
          const w = el.clientWidth, h = el.clientHeight;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        const last = d.frames - 1;
        let shown = -1;
        const apply = (f: number) => {
          d.joints.forEach((j, i) => {
            const m = motion.get(j);
            if (m) m.g.quaternion.setFromAxisAngle(m.axis, d.angles[f][i]);
          });
          d.grip_joints.forEach((j, i) => {
            for (const name of [j, j.replace("grip", "grip2")]) {
              const m = motion.get(name);
              if (m) m.g.position.copy(m.axis).multiplyScalar(d.grip[f][i]);
            }
          });
          const v = d.cloth[f];
          for (let i = 0; i < v.length; i++) pos.set(v[i], i * 3);
          geo.attributes.position.needsUpdate = true;
          geo.computeVertexNormals();
          if (scrub.current) scrub.current.value = String(f);
          if (readout.current)
            readout.current.textContent = `frame ${f + 1}/${d.frames} · ${(f / d.fps).toFixed(2)} s`;
        };

        scrub.current?.addEventListener("input", onScrub);
        function onScrub(e: Event) {
          frame.current = Number((e.target as HTMLInputElement).value);
          playing.current = false;
          if (playBtn.current) playBtn.current.textContent = "play";
        }
        playBtn.current?.addEventListener("click", onPlay);
        function onPlay() {
          if (!playing.current && frame.current >= last) frame.current = 0;
          playing.current = !playing.current;
          if (playBtn.current) playBtn.current.textContent = playing.current ? "pause" : "play";
        }
        frame.current = 0;
        playing.current = true;
        if (playBtn.current) playBtn.current.textContent = "pause";

        let prev = performance.now();
        const loop = (t: number) => {
          raf = requestAnimationFrame(loop);
          const dt = (t - prev) / 1000;
          prev = t;
          if (playing.current) {
            frame.current = Math.min(last, frame.current + dt * d.fps);
            if (frame.current >= last) {
              playing.current = false;
              if (playBtn.current) playBtn.current.textContent = "replay";
            }
          }
          const f = Math.round(frame.current);
          if (f !== shown) { apply(f); shown = f; }
          controls.update();
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(loop);

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          scrub.current?.removeEventListener("input", onScrub);
          playBtn.current?.removeEventListener("click", onPlay);
          controls.dispose();
          renderer.dispose();
          geo.dispose();
          el.removeChild(renderer.domElement);
        };
      })
      .catch((e: Error) => !dead && setError(e.message));
    return () => {
      dead = true;
      cleanup();
    };
  }, [kind]);

  const L = data?.log ?? [];
  const S = data?.summary;
  const cm = (v: number[]) => `${(v[0] * 100).toFixed(0)} x ${(v[1] * 100).toFixed(0)} cm`;

  return (
    <div className="replay">
      <p className="note">
        A replay of the physics simulation — every frame is from MuJoCo. Nothing here is animated.
      </p>
      <div className="replay-grid">
        <div>
          <div ref={box} className="replay-canvas" />
          <div className="replay-bar">
            <button ref={playBtn} type="button">pause</button>
            <input ref={scrub} type="range" min={0} max={Math.max(0, (data?.frames ?? 1) - 1)} step={1} defaultValue={0} aria-label="Frame" />
            <span ref={readout} />
          </div>
          {data && (
            <p className="note">
              How it folds: {data.phases.map((p) => `${p.name} (f${p.start_frame})`).join(" → ")}
            </p>
          )}
        </div>
        <div className="replay-log">
          <h3>Fold log · {kind}</h3>
          {error && <p className="note">{error}</p>}
          {!data && !error && <p className="note">loading…</p>}
          {L.map((l) => (
            <ul key={l.step}>
              <li>step <code>{l.step}</code></li>
              <li>width {l.width.toFixed(3)} (≥ {l.width_min})</li>
              <li>depth {l.depth.toFixed(3)} (≤ {l.depth_max})</li>
              <li>on top {l.on_top_mm.toFixed(1)} mm (≥ {l.on_top_min_mm})</li>
            </ul>
          ))}
          {S && data && (
            <>
              <p>laid flat {cm(S.laid_flat)}</p>
              <p>folded {cm(S.folded_size)}</p>
              <p>cycle {data.sim_seconds.toFixed(1)} s simulated</p>
              <p><strong>{S.verdict}</strong></p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
