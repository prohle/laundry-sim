// Synthetic solids and their silhouettes, for testing the hull (task 9.3). Not used by the product.
import type { Silhouette } from "./hull.ts";

export interface Solid {
  /** True if the 3D point is inside. */
  contains(x: number, y: number, z: number): boolean;
  /** True if the orthographic ray through (u, v) at angle t (degrees) hits the solid. */
  hit(u: number, v: number, angleDeg: number): boolean;
  /** Analytic volume, mm^3. */
  volume: number;
}

export function sphere(r: number): Solid {
  return {
    contains: (x, y, z) => x * x + y * y + z * z <= r * r,
    hit: (u, v) => u * u + v * v <= r * r,
    volume: (4 / 3) * Math.PI * r ** 3,
  };
}

/** Axis-aligned box, half sizes hx, hy, hz, centred on the origin. */
export function box(hx: number, hy: number, hz: number): Solid {
  return {
    contains: (x, y, z) => Math.abs(x) <= hx && Math.abs(y) <= hy && Math.abs(z) <= hz,
    hit: (u, v, a) => {
      const t = (a * Math.PI) / 180;
      return Math.abs(u) <= hx * Math.abs(Math.cos(t)) + hz * Math.abs(Math.sin(t)) && Math.abs(v) <= hy;
    },
    volume: 8 * hx * hy * hz,
  };
}

/**
 * A "mug": a solid cylinder (radius r, half height hy) with a notch on the +x side: x > notchX and
 * |z| < notchHalfWidth removed, full height. A bite, not a hole: no ray passes through it.
 */
export function notchedCylinder(r: number, hy: number, notchX: number, notchHalfWidth: number): Solid {
  const inNotch = (x: number, z: number) => x > notchX && Math.abs(z) < notchHalfWidth;
  const contains = (x: number, y: number, z: number) => x * x + z * z <= r * r && Math.abs(y) <= hy && !inNotch(x, z);
  return {
    contains,
    hit: (u, v, a) => {
      const t = (a * Math.PI) / 180;
      const c = Math.cos(t), s = Math.sin(t);
      // Ray: point on the u axis plus w * (-sin t, 0, cos t); march it through the bounding disc.
      for (let w = -r; w <= r; w += 0.05) {
        if (contains(u * c - w * s, v, u * s + w * c)) return true;
      }
      return false;
    },
    volume: NaN, // not needed; measured by voxel count where used
  };
}

/**
 * Conservative silhouette: a pixel is inside if any of a 5x5 grid of points over the pixel, corners
 * included, is hit. Bounds are square-pixel: u in [-halfU, halfU], v in [vMin, vMax].
 */
export function silhouetteOf(solid: Solid, angleDeg: number, halfU: number, vMin: number, vMax: number, pxPerMm: number): Silhouette {
  const width = Math.round(2 * halfU * pxPerMm);
  const height = Math.round((vMax - vMin) * pxPerMm);
  const data = new Uint8Array(width * height);
  const du = (2 * halfU) / width;
  const dv = (vMax - vMin) / height;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let inside = false;
      for (let j = 0; j <= 4 && !inside; j++) {
        for (let i = 0; i <= 4 && !inside; i++) {
          inside = solid.hit(-halfU + (px + i / 4) * du, vMax - (py + j / 4) * dv, angleDeg);
        }
      }
      if (inside) data[py * width + px] = 1;
    }
  }
  return { angleDeg, width, height, data, bounds: { uMin: -halfU, uMax: halfU, vMin, vMax } };
}
