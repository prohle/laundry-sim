"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CreasePattern } from "@/lib/crease";

interface Props {
  pattern: CreasePattern;
  /** 0 = flat sheet, 1 = fully folded relief */
  progress: number;
}

const HEIGHT_SCALE = 0.38;

export default function Relief3D({ pattern, progress }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    geometry: THREE.BufferGeometry;
    base: Float32Array;
    renderer: THREE.WebGLRenderer;
  } | null>(null);

  // ── Scene setup ────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0c);

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.01, 100);
    camera.position.set(0.75, 0.85, 1.15);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.6;
    controls.maxDistance = 3;
    controls.target.set(0, 0.05, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xfff3e2, 1.7);
    key.position.set(1.4, 2.2, 1.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fb6ff, 0.55);
    rim.position.set(-1.6, 0.8, -1.2);
    scene.add(rim);

    const { n, heights, solid } = pattern;
    const cell = 1 / n;

    const vertexHeight = new Float32Array((n + 1) * (n + 1));
    for (let y = 0; y <= n; y++) {
      for (let x = 0; x <= n; x++) {
        let sum = 0;
        let count = 0;
        for (const [dx, dy] of [
          [-1, -1],
          [-1, 0],
          [0, -1],
          [0, 0],
        ]) {
          const cx = x + dx;
          const cy = y + dy;
          if (
            cx >= 0 &&
            cy >= 0 &&
            cx < n &&
            cy < n &&
            solid[cy][cx]
          ) {
            sum += heights[cy][cx];
            count++;
          }
        }
        vertexHeight[y * (n + 1) + x] = count ? sum / count : 0;
      }
    }

    const positions: number[] = [];
    for (let y = 0; y <= n; y++) {
      for (let x = 0; x <= n; x++) {
        positions.push(x * cell - 0.5, 0, y * cell - 0.5);
      }
    }

    const indices: number[] = [];
    const at = (x: number, y: number) => y * (n + 1) + x;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!solid[y][x]) continue;
        const a = at(x, y);
        const b = at(x + 1, y);
        const c = at(x + 1, y + 1);
        const d = at(x, y + 1);
        indices.push(a, d, b, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0xf2f0eb,
      roughness: 0.82,
      metalness: 0.02,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Thin edge overlay so the grid reads as creases.
    const edges = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: 0xe8a33d,
        transparent: true,
        opacity: 0.18,
      }),
    );
    scene.add(edges);

    stateRef.current = { geometry, base: vertexHeight, renderer };

    const resize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      stateRef.current = null;
    };
  }, [pattern]);

  // ── Fold progress ──────────────────────────────────────────────────────
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const attr = state.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const base = state.base;
    for (let i = 0; i < base.length; i++) {
      arr[i * 3 + 1] = base[i] * HEIGHT_SCALE * progress;
    }
    attr.needsUpdate = true;
    state.geometry.computeVertexNormals();
    state.geometry.computeBoundingSphere();
  }, [progress, pattern]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
