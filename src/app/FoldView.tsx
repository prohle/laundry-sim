"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildCollapse, collapseFrame, measureFrame } from "@/lib/collapse";
import type { CollapseCp, CollapseMode } from "@/lib/collapse";

const PLAY_SECONDS = 8;

/**
 * Collapse of the crease pattern as rigid panels, computed from the pattern and a time value
 * (src/lib/collapse.ts). Nothing here is authored: no keyframes, no per-crease tuning.
 */
export default function FoldView({ cp, paperMm }: { cp: CollapseCp | null | undefined; paperMm: number }) {
  const build = useMemo(() => buildCollapse(cp, paperMm), [cp, paperMm]);
  const model = build.ok ? build.model : null;

  const [t, setT] = useState(0);
  const [mode, setMode] = useState<CollapseMode>("together");
  const [playing, setPlaying] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const renderRef = useRef<(() => void) | null>(null);

  // Scene: built once per model.
  useEffect(() => {
    const host = mountRef.current;
    if (!host || !model) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Rigid-panel collapse of the crease pattern. Drag to orbit.");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15151a);
    const camera = new THREE.PerspectiveCamera(35, 1, 1, paperMm * 20);
    const c = paperMm / 2;
    // Fixed start: in front of the sheet, raised, looking at its centre.
    camera.position.set(c, c - paperMm * 1.1, paperMm * 1.5);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(c, c, 0);
    controls.update();

    // One light from the side, low ambient, so creases read as shading.
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-paperMm * 2, c, paperMm * 0.8);
    sun.target.position.set(c, c, 0);
    scene.add(sun, sun.target);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(model.flat), 3));
    geometry.setIndex(new THREE.BufferAttribute(model.triangles, 1));
    // Front of the paper and its back are told apart by two neutral greys.
    const front = new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.9, metalness: 0, side: THREE.FrontSide });
    const back = new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 0.9, metalness: 0, side: THREE.BackSide });
    const mesh = new THREE.Mesh(geometry, front);
    const mesh2 = new THREE.Mesh(geometry, back);
    scene.add(mesh, mesh2);
    meshRef.current = mesh;

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(host);

    function draw() { renderer.render(scene, camera); }
    renderRef.current = draw;
    controls.addEventListener("change", draw);
    draw();

    return () => {
      ro.disconnect();
      controls.dispose();
      geometry.dispose();
      front.dispose();
      back.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      meshRef.current = null;
      renderRef.current = null;
    };
  }, [model, paperMm]);

  // Frame: a pure function of (model, mode, t).
  const measure = useMemo(() => {
    if (!model) return null;
    const frame = collapseFrame(model, mode, t);
    return { frame, m: measureFrame(model, frame) };
  }, [model, mode, t]);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !measure) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    (pos.array as Float32Array).set(measure.frame.positions);
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    renderRef.current?.();
  }, [measure]);

  // Play: advance t from where it is; stop at 1.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let done = false;
      setT((prev) => {
        const next = Math.min(1, prev + dt / PLAY_SECONDS);
        if (next >= 1) done = true;
        return next;
      });
      if (done) setPlaying(false); else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  if (!model) {
    return (
      <section className="fold-view" aria-label="Collapse illustration">
        <p className="fold-view__title">Collapse illustration — computed from the crease pattern</p>
        <div className="notice" role="alert">
          <p className="notice__title">No collapse is shown</p>
          {(build.ok ? [] : build.problems).map((p, i) => <p key={i} className="notice__body">{p}</p>)}
          <p className="notice__body notice__body--dim">A partial pattern is not drawn.</p>
        </div>
      </section>
    );
  }

  const n = model.stats.steps;
  const step = mode === "sequence" ? Math.min(n, Math.floor(t * n + 1e-9)) : null;
  const goStep = (k: number) => {
    setPlaying(false);
    setMode("sequence");
    setT(Math.min(1, Math.max(0, k / n)));
  };
  const current = mode === "sequence" ? Math.round(t * n * 1e6) / 1e6 : null;
  const m = measure!.m;
  const closes = m.maxVertexSplitMm < 0.01;

  return (
    <section className="fold-view" aria-label="Collapse illustration">
      <p className="fold-view__title">Collapse illustration — computed from the crease pattern</p>
      <div ref={mountRef} className="fold-view__canvas" data-testid="fold-canvas" />

      <div className="fold-view__controls">
        <button type="button" className="upload-label" onClick={() => { if (t >= 1) setT(0); setPlaying((p) => !p); }}>
          {playing ? "Pause" : t >= 1 ? "Replay" : "Play"}
        </button>
        <button type="button" className="upload-label" disabled={n === 0 || (current !== null && current <= 0) || (current === null && t <= 0)}
          onClick={() => goStep(current === null ? Math.ceil(t * n) - 1 : Math.ceil(current - 1e-9) - 1)}>
          Step back
        </button>
        <button type="button" className="upload-label" disabled={n === 0 || t >= 1}
          onClick={() => goStep(current === null ? Math.floor(t * n + 1e-9) + 1 : Math.floor(current + 1e-9) + 1)}>
          Step forward
        </button>
        <label className="fold-view__slider">
          <span>Progress {Math.round(t * 100)}%</span>
          <input
            type="range" min={0} max={1000} value={Math.round(t * 1000)}
            aria-label="Collapse progress"
            onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / 1000); }}
          />
        </label>
      </div>

      <p className="fold-view__status" role="status">
        {mode === "sequence"
          ? `One crease at a time, parents before children: ${step} of ${n} creases fully folded.`
          : "All creases turn together."}{" "}
        <button type="button" className="fold-view__link" onClick={() => setMode(mode === "sequence" ? "together" : "sequence")}>
          {mode === "sequence" ? "Turn all creases together" : "Fold one crease at a time"}
        </button>
      </p>

      <ul className="fold-view__facts">
        <li>{model.stats.faces} faces, {model.stats.triangles} triangles, {model.stats.creases} creases ({n} fold, in {model.stats.hinges} hinges).</li>
        <li>
          {closes
            ? "At this moment the panels meet along every shared edge."
            : `At this moment some of the ${model.stats.loopEdges} shared edges outside the spanning tree are torn apart, by up to ${m.maxVertexSplitMm.toFixed(0)} mm. Panels are rigid, so only the start and the end of the collapse close; the frames between are not a physical fold.`}
        </li>
        {model.warnings.map((w, i) => <li key={i} role="alert">{w}</li>)}
      </ul>
    </section>
  );
}
