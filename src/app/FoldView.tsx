"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildCollapse, collapseFrame, hingeSegment, SEAM_LIMIT_MM, seamProfile, SHAPE_ANGLE_DEG, T_MAX } from "@/lib/collapse";
import { currentStep, describeSteps, LONG_MODEL_STEPS } from "@/lib/steps";
import type { CollapseCp, CollapseMode } from "@/lib/collapse";

// Seconds per unit of t: the collapse (0 to 1) and the shaping (1 to 2) each take this long.
const PLAY_SECONDS = 8;

/**
 * Collapse of the crease pattern as rigid panels, computed from the pattern and a time value
 * (src/lib/collapse.ts). Nothing here is authored: no keyframes, no per-crease tuning.
 */
export default function FoldView({ cp, paperMm }: { cp: CollapseCp | null | undefined; paperMm: number }) {
  const build = useMemo(() => buildCollapse(cp, paperMm), [cp, paperMm]);
  const model = build.ok ? build.model : null;

  const [t, setT] = useState(0);
  const [mode, setMode] = useState<CollapseMode>("sequence");
  // Autoplays on mount (FoldView is remounted per tier), unless the visitor asks for reduced motion.
  const [playing, setPlaying] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  const mountRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<(() => void) | null>(null);
  // Playback lives in refs: the animation loop writes vertices and renders without going through React.
  // `t` in state is only a copy for the slider and the labels, synced ~10 times a second while playing.
  const tRef = useRef(0);
  const modeRef = useRef<CollapseMode>("sequence");
  const playingRef = useRef(false);
  const applyRef = useRef<((t: number) => void) | null>(null);
  const appliedRef = useRef("");
  const listRef = useRef<HTMLOListElement>(null);
  const rows = useMemo(() => (model ? describeSteps(model) : []), [model]);
  const seek = (x: number) => { tRef.current = x; setT(x); };

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

    // The active hinge: an amber bar drawn without depth testing, so it shows from any orbit angle.
    const markerGeometry = new THREE.CylinderGeometry(paperMm * 0.007, paperMm * 0.007, 1, 10);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xe8a33d, depthTest: false, depthWrite: false });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.renderOrder = 10;
    marker.frustumCulled = false;
    marker.visible = false;
    scene.add(marker);
    const yAxis = new THREE.Vector3(0, 1, 0);

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
    // Camera changes only redraw; they never touch t, the mode or playback.
    controls.addEventListener("change", draw);

    // Write the frame for (mode, t) into the vertex buffer and render. Called by the loop and by seeks.
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const apply = (tt: number) => {
      const frame = collapseFrame(model, modeRef.current, tt);
      (pos.array as Float32Array).set(frame.positions);
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      appliedRef.current = `${modeRef.current}:${tt}`;
      const idx = modeRef.current === "sequence" && tt <= 1 ? currentStep(model.active.length, tt) : -1;
      if (idx >= 0) {
        const [p, q] = hingeSegment(model, frame, model.active[idx]);
        const a = new THREE.Vector3(...p), d = new THREE.Vector3(...q).sub(a);
        marker.position.copy(a).addScaledVector(d, 0.5);
        marker.quaternion.setFromUnitVectors(yAxis, d.clone().normalize());
        marker.scale.set(1, Math.max(d.length(), 1e-3), 1);
        marker.visible = true;
        host.dataset.activeStep = String(idx + 1);
      } else {
        marker.visible = false;
        host.dataset.activeStep = "";
      }
      host.dataset.foldT = String(tt);
      host.dataset.seamMm = frame.seamErrorMm.toFixed(3);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox!;
      host.dataset.bbox = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => v.toFixed(2)).join(",");
      draw();
    };
    applyRef.current = apply;
    apply(tRef.current);

    return () => {
      ro.disconnect();
      controls.dispose();
      geometry.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      front.dispose();
      back.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      renderRef.current = null;
      applyRef.current = null;
      appliedRef.current = "";
    };
  }, [model, paperMm]);

  // Seam error per phase, sampled over each phase. Welding moves every shared vertex to the mean of the
  // positions its faces gave it; this is how far it had to move.
  const seam = useMemo(() => (model ? seamProfile(model, mode) : null), [model, mode]);

  // Play: the loop owns t while it runs. It stops at 1 and applies 1 once.
  useEffect(() => {
    if (!playing) return;
    playingRef.current = true;
    let raf = 0, last = performance.now(), lastSync = last;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(T_MAX, tRef.current + dt / PLAY_SECONDS);
      tRef.current = next;
      applyRef.current?.(next);
      if (next >= T_MAX) {
        playingRef.current = false;
        setT(T_MAX);
        setPlaying(false);
        return;
      }
      if (now - lastSync >= 100) { lastSync = now; setT(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); playingRef.current = false; };
  }, [playing]);

  // Seeks, step buttons and mode changes while not playing. Skips a frame that is already on screen.
  useEffect(() => {
    modeRef.current = mode;
    if (playingRef.current) return;
    if (appliedRef.current === `${mode}:${t}`) return;
    tRef.current = t;
    applyRef.current?.(t);
  }, [mode, t]);

  // Keep the current row inside the list's own scroll box without moving the page.
  const shaping = t > 1;
  const activeIdx = model && mode === "sequence" && !shaping ? currentStep(model.stats.steps, t) : -1;
  useEffect(() => {
    const list = listRef.current;
    const el = list && activeIdx >= 0 ? (list.children[activeIdx] as HTMLElement | undefined) : undefined;
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop || el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, el.offsetTop - list.clientHeight / 2);
    }
  }, [activeIdx]);

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
  const step = mode === "sequence" ? Math.min(n, Math.floor(Math.min(t, 1) * n + 1e-9)) : null;
  const goStep = (k: number) => {
    setPlaying(false);
    setMode("sequence");
    seek(Math.min(1, Math.max(0, k / n)));
  };
  const active = activeIdx;
  const current = mode === "sequence" ? Math.round(Math.min(t, 1) * n * 1e6) / 1e6 : null;
  const sp = seam!;
  const worstSeam = Math.max(sp.collapse.maxMm, sp.shape.maxMm);

  return (
    <section className="fold-view" aria-label="Collapse illustration">
      <div ref={mountRef} className="fold-view__canvas" data-testid="fold-canvas" />

      <div className="fold-view__controls">
        <button type="button" className="upload-label" onClick={() => {
          if (playing) { setT(tRef.current); setPlaying(false); return; }
          if (tRef.current >= T_MAX) seek(0);
          setPlaying(true);
        }}>
          {playing ? "Pause" : t >= T_MAX ? "Replay" : "Play"}
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
          <span>{shaping ? `Shape ${Math.round((t - 1) * 100)}%` : `Collapse ${Math.round(t * 100)}%`}</span>
          <input
            type="range" min={0} max={T_MAX * 1000} value={Math.round(t * 1000)}
            aria-label="Collapse and shape progress"
            onChange={(e) => { setPlaying(false); seek(Number(e.target.value) / 1000); }}
          />
          <span className="fold-view__phases" aria-hidden="true">
            <span style={{ fontWeight: shaping ? 400 : 700 }}>Collapse</span>
            <span style={{ fontWeight: shaping ? 700 : 400 }}>Shape</span>
          </span>
        </label>
      </div>

      <ol ref={listRef} className="steps" aria-label={`Folding steps, ${n} hinges`} data-testid="step-list">
        {rows.map((r, i) => (
          <li key={r.number}>
            <button
              type="button"
              className={`steps__row${i === active ? " steps__row--current" : ""}${i < (shaping ? n : active) ? " steps__row--done" : ""}`}
              aria-current={i === active ? "step" : undefined}
              data-step={r.number}
              onClick={() => goStep(r.number)}
            >
              <span className="steps__num">{r.number}</span>
              <span className="steps__dir">{r.direction}</span>
              <span className="steps__angle">{r.angle}°</span>
              <span className="steps__hint">{r.hint}</span>
            </button>
          </li>
        ))}
      </ol>

      <p className="fold-view__caption">
        A crease-by-crease guide computed from the pattern. It is not a verified human folding sequence; we do not have one.
        The pattern specifies the collapse to 180 degrees (Collapse). Shape opens every folding crease from 180 to {SHAPE_ANGLE_DEG} degrees:
        it is a visualisation of a base being opened, not a state the pattern encodes.
      </p>
      {n > LONG_MODEL_STEPS && (
        <p className="fold-view__long" role="alert">
          This model has {n} steps, more than {LONG_MODEL_STEPS}. It is long to fold.
        </p>
      )}
      <p className="fold-view__status" role="status">
        {shaping
          ? `Shaping: every folding crease is opening from 180 to ${SHAPE_ANGLE_DEG} degrees.`
          : mode === "sequence"
          ? `One crease at a time, parents before children: ${step} of ${n} creases fully folded.`
          : "All creases turn together."}{" "}
        <button type="button" className="fold-view__link" onClick={() => setMode(mode === "sequence" ? "together" : "sequence")}>
          {mode === "sequence" ? "Turn all creases together" : "Fold one crease at a time"}
        </button>
      </p>

      <ul className="fold-view__facts">
        <li>{model.stats.faces} faces, {model.stats.triangles} triangles, {model.stats.creases} creases ({n} fold, in {model.stats.hinges} hinges).</li>
        <li>
          Seam error, the largest distance a welded vertex moved: Collapse {sp.collapse.maxMm.toFixed(1)} mm, Shape {sp.shape.maxMm.toFixed(1)} mm.
          {worstSeam > SEAM_LIMIT_MM
            ? ` Over ${SEAM_LIMIT_MM} mm: the fold is too far from a real surface for welding to hide. The ${model.stats.loopEdges} shared edges outside the spanning tree are pulled together and the paper is stretched there; these frames are not a physical fold.`
            : " The panels meet along every shared edge without stretching the paper noticeably."}
        </li>
        {model.warnings.map((w, i) => <li key={i} role="alert">{w}</li>)}
      </ul>
    </section>
  );
}
