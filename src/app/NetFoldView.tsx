"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { measureNetFold, netFoldFrame } from "@/lib/netfold";
import type { NetFold } from "@/lib/netfold";

/** Seconds for t to go from 0 to 1 when playing. */
const PLAY_SECONDS = 6;

/**
 * The net folding into its solid (R9.6), computed from the net: rigid panels on a spanning tree, no keyframes.
 * Playback lives in refs, as in FoldView: the loop writes vertices and renders without going through React,
 * and `t` in state is a copy for the slider and the readout, synced about ten times a second while playing.
 */
export default function NetFoldView({ fold }: { fold: NetFold }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const mountRef = useRef<HTMLDivElement>(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const applyRef = useRef<((t: number) => void) | null>(null);
  const appliedRef = useRef<number>(-1);

  // Bounds over the whole motion, so the camera does not have to move: the flat net and the folded solid.
  const bounds = useMemo(() => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k <= 20; k++) {
      const p = netFoldFrame(fold, k / 20).positions;
      for (let i = 0; i < p.length; i++) {
        const v = i % 3 === 1 ? -p[i] : p[i];
        lo[i % 3] = Math.min(lo[i % 3], v);
        hi[i % 3] = Math.max(hi[i % 3], v);
      }
    }
    const c = lo.map((l, i) => (l + hi[i]) / 2);
    const r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
    return { c, r };
  }, [fold]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    const { c, r } = bounds;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "The net folding into a solid. Drag to orbit.");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15151a);
    const camera = new THREE.PerspectiveCamera(35, 1, r * 0.05, r * 40);
    camera.up.set(0, 0, 1);
    // In front of the sheet, raised, looking at the middle of the motion.
    camera.position.set(c[0] + r * 0.9, c[1] - r * 2.4, c[2] + r * 2.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(c[0], c[1], c[2]);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(c[0] - r * 2, c[1] - r * 2, c[2] + r * 3);
    sun.target.position.set(c[0], c[1], c[2]);
    scene.add(sun, sun.target);

    const n = fold.faces.length;
    // Net y runs down the page; the scene's y runs up. Negating it keeps t = 0 looking like the printed net, and
    // that reverses each triangle, so the corner order is swapped where needed to keep the printed side in front.
    const order = fold.faces.map((f) => {
      const cr = (f.p[1][0] - f.p[0][0]) * (f.p[2][1] - f.p[0][1]) - (f.p[2][0] - f.p[0][0]) * (f.p[1][1] - f.p[0][1]);
      return cr < 0 ? [0, 1, 2] : [0, 2, 1];
    });
    const geometry = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 9), 3);
    geometry.setAttribute("position", pos);
    const tri = new Uint32Array(n * 3);
    const lines = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const [a, b, d] = order[i];
      tri.set([i * 3 + a, i * 3 + b, i * 3 + d], i * 3);
      lines.set([i * 3, i * 3 + 1, i * 3 + 1, i * 3 + 2, i * 3 + 2, i * 3], i * 6);
    }
    geometry.setIndex(new THREE.BufferAttribute(tri, 1));
    const front = new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.9, metalness: 0, side: THREE.FrontSide });
    const back = new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 0.9, metalness: 0, side: THREE.BackSide });
    scene.add(new THREE.Mesh(geometry, front), new THREE.Mesh(geometry, back));
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", pos);
    edgeGeometry.setIndex(new THREE.BufferAttribute(lines, 1));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x2b2d33 });
    scene.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const draw = () => renderer.render(scene, camera);
    resize();
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(host);
    // Camera changes only redraw; they never touch t or playback.
    controls.addEventListener("change", draw);

    let frames = 0;
    const apply = (tt: number) => {
      const fr = netFoldFrame(fold, tt);
      const a = pos.array as Float32Array;
      for (let i = 0; i < fr.positions.length; i++) a[i] = i % 3 === 1 ? -fr.positions[i] : fr.positions[i];
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      appliedRef.current = tt;
      frames++;
      const m = measureNetFold(fold, fr);
      host.dataset.foldT = String(tt);
      host.dataset.frames = String(frames);
      host.dataset.gapMm = m.closureGapMm.toExponential(3);
      host.dataset.bbox = m.bbox.map((v) => v.toFixed(2)).join(",");
      host.dataset.ortho = m.maxOrthonormalityError.toExponential(2);
      host.dataset.det = m.maxDeterminantError.toExponential(2);
      host.dataset.stretch = m.maxEdgeStretchMm.toExponential(2);
      draw();
    };
    applyRef.current = apply;
    apply(tRef.current);

    return () => {
      ro.disconnect();
      controls.dispose();
      geometry.dispose();
      edgeGeometry.dispose();
      front.dispose();
      back.dispose();
      edgeMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      applyRef.current = null;
      appliedRef.current = -1;
    };
  }, [fold, bounds]);

  // Play: the loop owns t while it runs. It stops at 1.
  useEffect(() => {
    if (!playing) return;
    playingRef.current = true;
    let raf = 0, last = performance.now(), lastSync = last;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(1, tRef.current + dt / PLAY_SECONDS);
      tRef.current = next;
      applyRef.current?.(next);
      if (next >= 1) { playingRef.current = false; setT(1); setPlaying(false); return; }
      if (now - lastSync >= 100) { lastSync = now; setT(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); playingRef.current = false; };
  }, [playing]);

  // Scrubbing while not playing.
  useEffect(() => {
    if (playingRef.current) return;
    if (appliedRef.current === t) return;
    tRef.current = t;
    applyRef.current?.(t);
  }, [t]);

  const live = useMemo(() => measureNetFold(fold, netFoldFrame(fold, t)), [fold, t]);
  const final = useMemo(() => measureNetFold(fold, netFoldFrame(fold, 1)), [fold]);

  return (
    <section className="fold-view" aria-label="The net folding into the solid">
      <div ref={mountRef} className="fold-view__canvas" data-testid="net-fold-canvas" />
      <div className="fold-view__controls">
        <button type="button" className="upload-label" onClick={() => {
          if (playing) { setT(tRef.current); setPlaying(false); return; }
          if (tRef.current >= 1) { tRef.current = 0; setT(0); }
          setPlaying(true);
        }}>
          {playing ? "Pause" : t >= 1 ? "Replay" : "Play"}
        </button>
        <label className="fold-view__slider">
          <span>Folded {Math.round(t * 100)}%</span>
          <input type="range" min={0} max={1000} value={Math.round(t * 1000)} aria-label="Fold progress"
            onChange={(e) => { setPlaying(false); const x = Number(e.target.value) / 1000; tRef.current = x; setT(x); }} />
        </label>
      </div>
      <p className="fold-view__caption">
        The net is cut along the solid lines and folded along the dashed ones. This 3D view is that fold, computed from the net:
        each face is a rigid panel turned about the edge it shares with its parent. Tabs are not drawn.
      </p>
      <ul className="fold-view__facts">
        <li>
          Gap between the two ends of every cut edge: {live.closureGapMm.toFixed(3)} mm now, {final.closureGapMm.toExponential(1)} mm when closed.
          {final.closureGapMm > 0.01 ? " That is not zero: the net does not close this solid." : " The cut edges meet: the net closes the solid."}
        </li>
      </ul>
    </section>
  );
}
