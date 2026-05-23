/**
 * genesisShapes — point-cloud generators for the agent-genesis ritual.
 *
 * These mirror the 12 shape generators in `expressiveField.js` (the composer's
 * particle engine), but parameterized by particle count `n` so the genesis
 * overlay can run at its own resolution without touching the engine. Each
 * generator returns a Float32Array of length 3*n: [x0,y0,z0, x1,y1,z1, …] in
 * roughly unit space (~[-1.2, 1.2] per axis).
 *
 * NOTE: shape math is intentionally duplicated from expressiveField.js to keep
 * the genesis feature fully isolated from the composer centerpiece. If we ever
 * want a single source, the engine's generators can be refactored to import
 * from here — but that's a separate, careful change to the crown-jewel file.
 */

export const SHAPE_NAMES = [
  'Sphere',       // 0
  'Cube',         // 1
  'Octahedron',   // 2
  'HexPrism',     // 3
  'Torus',        // 4
  'Blob',         // 5
  'Klein',        // 6
  'DoubleHelix',  // 7
  'Lorenz',       // 8
  'Manifold',     // 9
  'Echo',         // 10
  'Mobius',       // 11
  'Tetrahedron',  // 12 — pyramid
  'Icosahedron',  // 13 — geodesic
  'HexBipyramid', // 14 — hexagonal gem
] as const;

export type ShapeIndex = number; // 0..11

/**
 * Curated pool for agent birth — complete, recognizable geometric solids only.
 * Sphere, Cube, Octahedron (diamond), Tetrahedron (pyramid), Icosahedron
 * (geodesic), HexBipyramid (gem), Dodecahedron, plus Echo (nested spheres) and
 * Blob. The abstract topology (Möbius, Klein, Lorenz, Manifold, DoubleHelix)
 * and the plain HexPrism/Torus are intentionally excluded.
 */
export const GENESIS_POOL: ShapeIndex[] = [0, 1, 2, 5, 10, 12, 13, 14];

function gaussRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function genSphere(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    arr[i * 3] = Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = Math.cos(phi);
    arr[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
  }
  return arr;
}

function genCube(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const s = 0.78;
  for (let i = 0; i < n; i++) {
    const face = i % 6;
    const u = (Math.random() * 2 - 1) * s;
    const v = (Math.random() * 2 - 1) * s;
    let x = 0;
    let y = 0;
    let z = 0;
    switch (face) {
      case 0: x = s; y = u; z = v; break;
      case 1: x = -s; y = u; z = v; break;
      case 2: x = u; y = s; z = v; break;
      case 3: x = u; y = -s; z = v; break;
      case 4: x = u; y = v; z = s; break;
      default: x = u; y = v; z = -s; break;
    }
    arr[i * 3] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
  }
  return arr;
}

function genOctahedron(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const x = gaussRandom();
    const y = gaussRandom();
    const z = gaussRandom();
    const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) + 0.0001;
    const s = 1.15;
    arr[i * 3] = (x / l1) * s;
    arr[i * 3 + 1] = (y / l1) * s;
    arr[i * 3 + 2] = (z / l1) * s;
  }
  return arr;
}

function genHexPrism(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const R = 0.82;
  const HP = 0.82;
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (r < 0.3) {
      const face = Math.floor(Math.random() * 6);
      const a1 = (face * Math.PI) / 3;
      const a2 = ((face + 1) * Math.PI) / 3;
      const uu = Math.random();
      const vv = Math.random();
      const s = uu + vv > 1 ? [1 - uu, 1 - vv] : [uu, vv];
      const yTop = r < 0.15 ? HP : -HP;
      arr[i * 3] = s[0] * Math.cos(a1) * R + s[1] * Math.cos(a2) * R;
      arr[i * 3 + 1] = yTop;
      arr[i * 3 + 2] = s[0] * Math.sin(a1) * R + s[1] * Math.sin(a2) * R;
    } else {
      const face = Math.floor(Math.random() * 6);
      const a1 = (face * Math.PI) / 3;
      const a2 = ((face + 1) * Math.PI) / 3;
      const t = Math.random();
      arr[i * 3] = Math.cos(a1) * R * (1 - t) + Math.cos(a2) * R * t;
      arr[i * 3 + 1] = (Math.random() * 2 - 1) * HP;
      arr[i * 3 + 2] = Math.sin(a1) * R * (1 - t) + Math.sin(a2) * R * t;
    }
  }
  return arr;
}

function genTorus(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const Rm = 0.7;
  const rm = 0.3;
  for (let i = 0; i < n; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * Math.PI * 2;
    arr[i * 3] = (Rm + rm * Math.cos(v)) * Math.cos(u);
    arr[i * 3 + 1] = rm * Math.sin(v);
    arr[i * 3 + 2] = (Rm + rm * Math.cos(v)) * Math.sin(u);
  }
  return arr;
}

function genBlob(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    const d =
      1 +
      Math.sin(x * 2.7 + y * 1.9) * 0.28 +
      Math.sin(y * 3.4 - z * 1.6) * 0.22 +
      Math.sin(z * 2.2 + x * 2.8) * 0.18 +
      Math.sin((x + y + z) * 3.1) * 0.12;
    arr[i * 3] = x * d;
    arr[i * 3 + 1] = y * d;
    arr[i * 3 + 2] = z * d;
  }
  return arr;
}

function genKlein(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const R = 1.2;
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 * Math.PI;
    const v = Math.random() * 2 * Math.PI;
    const cosU2 = Math.cos(u / 2);
    const sinU2 = Math.sin(u / 2);
    const sinV = Math.sin(v);
    const sin2V = Math.sin(2 * v);
    const factor = R + cosU2 * sinV - sinU2 * sin2V;
    arr[i * 3] = factor * Math.cos(u) * 0.48;
    arr[i * 3 + 1] = (sinU2 * sinV + cosU2 * sin2V) * 0.48;
    arr[i * 3 + 2] = factor * Math.sin(u) * 0.48;
  }
  return arr;
}

function genDoubleHelix(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const turns = 3;
  const maxT = turns * 2 * Math.PI;
  const rad = 0.55;
  const height = 1.8;
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    if (r < 0.88) {
      const strand = Math.floor(Math.random() * 2);
      const t = Math.random() * maxT;
      const y = (t / maxT - 0.5) * height;
      const angle = t + strand * Math.PI;
      arr[i * 3] = rad * Math.cos(angle);
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = rad * Math.sin(angle);
    } else {
      const rungCount = 16;
      const rung = Math.floor(Math.random() * rungCount);
      const tRung = (rung / rungCount) * maxT;
      const t = Math.random();
      const y = (tRung / maxT - 0.5) * height;
      const a1 = tRung;
      const a2 = tRung + Math.PI;
      const x1 = rad * Math.cos(a1);
      const z1 = rad * Math.sin(a1);
      const x2 = rad * Math.cos(a2);
      const z2 = rad * Math.sin(a2);
      arr[i * 3] = x1 + (x2 - x1) * t;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z1 + (z2 - z1) * t;
    }
  }
  return arr;
}

function genLorenz(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const sigma = 10;
  const rho = 28;
  const beta = 8 / 3;
  let x = 0.1;
  let y = 0;
  let z = 0;
  const dt = 0.005;
  for (let i = 0; i < 3000; i++) {
    const dx = sigma * (y - x);
    const dy = x * (rho - z) - y;
    const dz = x * y - beta * z;
    x += dx * dt;
    y += dy * dt;
    z += dz * dt;
  }
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 3; j++) {
      const dx = sigma * (y - x);
      const dy = x * (rho - z) - y;
      const dz = x * y - beta * z;
      x += dx * dt;
      y += dy * dt;
      z += dz * dt;
    }
    pts[i * 3] = x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = z;
  }
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (pts[i * 3] < xMin) xMin = pts[i * 3];
    if (pts[i * 3] > xMax) xMax = pts[i * 3];
    if (pts[i * 3 + 1] < yMin) yMin = pts[i * 3 + 1];
    if (pts[i * 3 + 1] > yMax) yMax = pts[i * 3 + 1];
    if (pts[i * 3 + 2] < zMin) zMin = pts[i * 3 + 2];
    if (pts[i * 3 + 2] > zMax) zMax = pts[i * 3 + 2];
  }
  const ccx = (xMin + xMax) / 2;
  const ccy = (yMin + yMax) / 2;
  const ccz = (zMin + zMax) / 2;
  const maxExt = Math.max(xMax - xMin, yMax - yMin, zMax - zMin);
  const s = 1.9 / maxExt;
  for (let i = 0; i < n; i++) {
    arr[i * 3] = (pts[i * 3] - ccx) * s;
    arr[i * 3 + 1] = (pts[i * 3 + 1] - ccy) * s;
    arr[i * 3 + 2] = (pts[i * 3 + 2] - ccz) * s;
  }
  return arr;
}

function genManifold(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const ringR = 0.9;
  const thickness = 0.035;
  for (let i = 0; i < n; i++) {
    const ring = i % 3;
    const u = Math.random() * 2 * Math.PI;
    let x = 0;
    let y = 0;
    let z = 0;
    if (ring === 0) {
      x = ringR * Math.cos(u);
      y = ringR * Math.sin(u);
    } else if (ring === 1) {
      y = ringR * Math.cos(u);
      z = ringR * Math.sin(u);
    } else {
      x = ringR * Math.cos(u);
      z = ringR * Math.sin(u);
    }
    arr[i * 3] = x + (Math.random() - 0.5) * thickness;
    arr[i * 3 + 1] = y + (Math.random() - 0.5) * thickness;
    arr[i * 3 + 2] = z + (Math.random() - 0.5) * thickness;
  }
  return arr;
}

function genEcho(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const radii = [0.38, 0.68, 0.98];
  const weights = [0.15, 0.3, 0.55];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let shellIdx = 0;
    let cum = 0;
    for (let s = 0; s < 3; s++) {
      cum += weights[s];
      if (r < cum) {
        shellIdx = s;
        break;
      }
    }
    const rad = radii[shellIdx];
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    arr[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = rad * Math.cos(phi);
    arr[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
  }
  return arr;
}

function genMobius(n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  const R = 0.9;
  const width = 0.35;
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 * Math.PI;
    const v = (Math.random() * 2 - 1) * width;
    const x = (R + v * Math.cos(u / 2)) * Math.cos(u);
    const y = (R + v * Math.cos(u / 2)) * Math.sin(u);
    const z = v * Math.sin(u / 2);
    arr[i * 3] = x * 0.95;
    arr[i * 3 + 1] = z * 0.95;
    arr[i * 3 + 2] = y * 0.95;
  }
  return arr;
}

// ── Polyhedra (face-sampled) ───────────────────────────────────────────────

/** Normalize each vertex to unit length, then scale (so the solid sits in the
 *  same ~unit extent as the other shapes). */
function normVerts(raw: number[][], scale: number): number[][] {
  return raw.map(([x, y, z]) => {
    const L = Math.hypot(x, y, z) || 1;
    return [(x / L) * scale, (y / L) * scale, (z / L) * scale];
  });
}

/** Scatter n points uniformly across a set of triangular faces. */
function sampleTriangles(verts: number[][], tris: number[][], n: number): Float32Array {
  const arr = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const tri = tris[(Math.random() * tris.length) | 0];
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const a = verts[tri[0]];
    const b = verts[tri[1]];
    const c = verts[tri[2]];
    arr[i * 3] = a[0] * w + b[0] * u + c[0] * v;
    arr[i * 3 + 1] = a[1] * w + b[1] * u + c[1] * v;
    arr[i * 3 + 2] = a[2] * w + b[2] * u + c[2] * v;
  }
  return arr;
}

function genTetrahedron(n: number): Float32Array {
  const verts = normVerts(
    [
      [1, 1, 1],
      [-1, -1, 1],
      [-1, 1, -1],
      [1, -1, -1],
    ],
    1.3,
  );
  const tris = [
    [0, 1, 2],
    [0, 1, 3],
    [0, 2, 3],
    [1, 2, 3],
  ];
  return sampleTriangles(verts, tris, n);
}

function genIcosahedron(n: number): Float32Array {
  const p = (1 + Math.sqrt(5)) / 2;
  const verts = normVerts(
    [
      [-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0],
      [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p],
      [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1],
    ],
    1.12,
  );
  const tris = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return sampleTriangles(verts, tris, n);
}

function genHexBipyramid(n: number): Float32Array {
  const R = 0.92;
  const h = 1.18;
  const verts: number[][] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    verts.push([R * Math.cos(a), 0, R * Math.sin(a)]);
  }
  verts.push([0, h, 0]); // 6 — top apex
  verts.push([0, -h, 0]); // 7 — bottom apex
  const tris: number[][] = [];
  for (let k = 0; k < 6; k++) {
    const nx = (k + 1) % 6;
    tris.push([6, k, nx]); // top fan
    tris.push([7, nx, k]); // bottom fan
  }
  return sampleTriangles(verts, tris, n);
}

const GENERATORS: Array<(n: number) => Float32Array> = [
  genSphere,
  genCube,
  genOctahedron,
  genHexPrism,
  genTorus,
  genBlob,
  genKlein,
  genDoubleHelix,
  genLorenz,
  genManifold,
  genEcho,
  genMobius,
  genTetrahedron,
  genIcosahedron,
  genHexBipyramid,
];

/** Generate a shape's point cloud (Float32Array, length 3*n). */
export function generateShapePoints(shapeIndex: ShapeIndex, n: number): Float32Array {
  const gen = GENERATORS[((shapeIndex % GENERATORS.length) + GENERATORS.length) % GENERATORS.length];
  return gen(n);
}

/**
 * Deterministic shape for an agent — same id always yields the same shape, so
 * an agent's form is a stable part of its identity. `pool` lets the caller
 * curate which shapes are eligible (defaults to all 12).
 */
export function shapeForAgent(agentId: string, pool: ShapeIndex[] = GENERATORS.map((_, i) => i)): ShapeIndex {
  let h = 2166136261;
  for (let i = 0; i < agentId.length; i++) {
    h ^= agentId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % pool.length;
  return pool[idx];
}
