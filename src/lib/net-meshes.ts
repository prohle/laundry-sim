import type { Mesh, Vec3 } from "./net.ts";

/** Unit cube, 8 vertices, 12 triangles (each square split on a diagonal), outward winding. */
export function cube(): Mesh {
  const vertices: Vec3[] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const faces: Mesh["faces"] = [
    [0, 2, 1], [0, 3, 2], // bottom
    [4, 5, 6], [4, 6, 7], // top
    [0, 1, 5], [0, 5, 4], // front
    [2, 3, 7], [2, 7, 6], // back
    [1, 2, 6], [1, 6, 5], // right
    [3, 0, 4], [3, 4, 7], // left
  ];
  return { vertices, faces };
}

/** Regular icosahedron, circumradius 1: 12 vertices, 20 faces. */
export function icosahedron(): Mesh {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: Vec3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const n = Math.hypot(1, t);
  const vertices = raw.map((v) => [v[0] / n, v[1] / n, v[2] / n] as Vec3);
  const faces: Mesh["faces"] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { vertices, faces };
}

/** Icosahedron subdivided `levels` times and projected to the unit sphere: 20 * 4^levels faces. */
export function icosphere(levels: number): Mesh {
  let { vertices, faces } = icosahedron();
  for (let l = 0; l < levels; l++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      const hit = cache.get(k);
      if (hit !== undefined) return hit;
      const m: Vec3 = [
        (vertices[a][0] + vertices[b][0]) / 2,
        (vertices[a][1] + vertices[b][1]) / 2,
        (vertices[a][2] + vertices[b][2]) / 2,
      ];
      const n = Math.hypot(...m);
      vertices.push([m[0] / n, m[1] / n, m[2] / n]);
      cache.set(k, vertices.length - 1);
      return vertices.length - 1;
    };
    const next: Mesh["faces"] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { vertices, faces };
}

/** An icosphere (or the icosahedron at levels = 0) with a smooth radial bump; deterministic. */
export function bumpy(levels: number, amp: number, f: number): Mesh {
  const m = levels === 0 ? icosahedron() : icosphere(levels);
  return {
    faces: m.faces,
    vertices: m.vertices.map((v) => {
      const s = 1 + amp * Math.sin(f * v[0] + 3 * v[1] + f) * Math.cos(5 * v[2] - f);
      return [v[0] * s, v[1] * s, v[2] * s] as Vec3;
    }),
  };
}

/** Closed torus, nu x nv quads each split into two triangles. Genus 1: its net always overlaps here. */
export function torus(nu: number, nv: number, R = 1, r = 0.4): Mesh {
  const vertices: Vec3[] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u = (2 * Math.PI * i) / nu;
      const v = (2 * Math.PI * j) / nv;
      vertices.push([(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)]);
    }
  }
  const id = (i: number, j: number) => (i % nu) * nv + (j % nv);
  const faces: Mesh["faces"] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      faces.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  }
  return { vertices, faces };
}
