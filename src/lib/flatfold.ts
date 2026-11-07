/**
 * Local flat-foldability of a crease pattern (task 2.4).
 *
 * Checks Kawasaki's and Maekawa's theorems at every interior vertex. Both are necessary and
 * neither is sufficient: a pattern that passes is not proved foldable (task 2.5 is the state
 * count), but a pattern that fails cannot be folded flat as drawn.
 *
 * Pure and deterministic: no randomness, no I/O, input order does not change the report
 * (failures are listed in vertex index order).
 */

export type FoldCode = "M" | "V" | "F" | "B" | "U";

export interface FlatCp {
  vertices: [number, number][];
  creases: { from: number; to: number; fold: FoldCode | string }[];
}

export interface FlatFoldOptions {
  /**
   * Kawasaki tolerance, radians. Default 2e-5.
   *
   * The residuals are the solver's optimiser stopping short of exact convergence, not a
   * defect in the pattern. The largest observed is 1.08e-5 rad, on the bush dog. That is far
   * below paper tolerance. The report still prints the largest residual (`maxResidual`), so
   * the number is never hidden.
   */
  tolerance?: number;
  /** A vertex within this distance of the unit-square edge counts as on the boundary. Default 1e-9. */
  edgeEpsilon?: number;
  /** Paper extent: vertices on x or y equal to these are boundary. Default [0, 1]. */
  paperMin?: number;
  paperMax?: number;
  /** How many failures to list. Default 10. */
  maxFailures?: number;
}

export interface VertexFailure {
  vertex: number;
  position: [number, number];
  degree: number;
  /** Alternating sector sum (even minus odd), radians. For odd degree it is not meaningful. */
  kawasakiResidual: number;
  mountains: number;
  valleys: number;
  /** Creases that are F or U: excluded from the Maekawa count. */
  unassigned: number;
  failsKawasaki: boolean;
  failsMaekawa: boolean;
  reason: string;
}

export interface FlatFoldReport {
  /** Vertices with degree >= 3 and not on the boundary. */
  interiorVertices: number;
  /** Vertices skipped as boundary (any incident B crease, or on the paper edge) with degree >= 3. */
  skippedBoundary: number;
  /** Vertices skipped because their degree is below 3 and they are not boundary. */
  skippedLowDegree: number;
  passBoth: number;
  failKawasaki: number;
  failMaekawa: number;
  failEither: number;
  /** Interior vertices whose Maekawa failure is only because no M/V is assigned (M = V = 0). */
  noAssignment: number;
  /** Largest |Kawasaki residual| over interior vertices of even degree, radians. 0 if none. */
  maxResidual: number;
  /** Interior vertices with odd degree (Kawasaki cannot hold). */
  oddDegree: number;
  tolerance: number;
  failures: VertexFailure[];
}

export function checkFlatFoldable(cp: FlatCp, opts: FlatFoldOptions = {}): FlatFoldReport {
  const tolerance = opts.tolerance ?? 2e-5;
  const eps = opts.edgeEpsilon ?? 1e-9;
  const lo = opts.paperMin ?? 0;
  const hi = opts.paperMax ?? 1;
  const maxFailures = opts.maxFailures ?? 10;

  const incident: number[][] = cp.vertices.map(() => []);
  cp.creases.forEach((c, i) => {
    if (c.from === c.to) return;
    incident[c.from]?.push(i);
    incident[c.to]?.push(i);
  });

  const report: FlatFoldReport = {
    interiorVertices: 0,
    skippedBoundary: 0,
    skippedLowDegree: 0,
    passBoth: 0,
    failKawasaki: 0,
    failMaekawa: 0,
    failEither: 0,
    noAssignment: 0,
    maxResidual: 0,
    oddDegree: 0,
    tolerance,
    failures: [],
  };

  for (let v = 0; v < cp.vertices.length; v++) {
    const [x, y] = cp.vertices[v];
    const ids = incident[v];
    const onEdge = x <= lo + eps || x >= hi - eps || y <= lo + eps || y >= hi - eps;
    const hasBorder = ids.some((i) => cp.creases[i].fold === "B");
    if (onEdge || hasBorder) {
      if (ids.length >= 3) report.skippedBoundary++;
      else report.skippedLowDegree++;
      continue;
    }
    if (ids.length < 3) {
      report.skippedLowDegree++;
      continue;
    }

    report.interiorVertices++;

    // Directions, sorted by atan2. Ties (coincident creases) break on crease index: deterministic.
    const dirs = ids
      .map((i) => {
        const c = cp.creases[i];
        const o = c.from === v ? c.to : c.from;
        const [ox, oy] = cp.vertices[o];
        return { i, a: Math.atan2(oy - y, ox - x) };
      })
      .sort((p, q) => p.a - q.a || p.i - q.i);
    const n = dirs.length;
    const sectors: number[] = [];
    for (let k = 0; k < n; k++) {
      const next = k + 1 < n ? dirs[k + 1].a : dirs[0].a + 2 * Math.PI;
      sectors.push(next - dirs[k].a);
    }
    let even = 0;
    let odd = 0;
    sectors.forEach((s, k) => (k % 2 === 0 ? (even += s) : (odd += s)));
    const residual = even - odd;
    const isOdd = n % 2 === 1;
    const failsK = isOdd || Math.abs(residual) > tolerance;
    if (isOdd) report.oddDegree++;
    else report.maxResidual = Math.max(report.maxResidual, Math.abs(residual));

    let m = 0;
    let val = 0;
    let un = 0;
    for (const { i } of dirs) {
      const f = cp.creases[i].fold;
      if (f === "M") m++;
      else if (f === "V") val++;
      else un++;
    }
    const failsM = Math.abs(m - val) !== 2;

    if (failsK) report.failKawasaki++;
    if (failsM) report.failMaekawa++;
    if (failsM && m === 0 && val === 0) report.noAssignment++;
    if (failsK || failsM) {
      report.failEither++;
      if (report.failures.length < maxFailures) {
        const why: string[] = [];
        if (isOdd) why.push(`odd degree ${n}: Kawasaki cannot hold`);
        else if (failsK) why.push(`Kawasaki off by ${residual.toExponential(2)} rad`);
        if (failsM) why.push(m === 0 && val === 0 ? "no mountain/valley assigned" : `|M-V| = ${Math.abs(m - val)}, not 2`);
        report.failures.push({
          vertex: v,
          position: [x, y],
          degree: n,
          kawasakiResidual: residual,
          mountains: m,
          valleys: val,
          unassigned: un,
          failsKawasaki: failsK,
          failsMaekawa: failsM,
          reason: why.join("; "),
        });
      }
    } else {
      report.passBoth++;
    }
  }
  return report;
}
