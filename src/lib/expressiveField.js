// Sovereign Mind — Expressive Field Particle Visualizer
// Ported from expressive-field.html (sovereign-mind repo) for use in
// Polyphonic-v2. 12 shapes, cymatic harmonics, quantum cascade, drifting
// focus. Single-instance module (one per page is the design intent).
//
// Usage from React:
//   import ExpressiveField from '@/lib/expressiveField'
//   ExpressiveField.init(canvasEl, containerEl)
//   ExpressiveField.setState('thinking')
//   ExpressiveField.destroy()

export function createExpressiveField() {

// Cap at 2x: on DPR-3 phones the fixed particle count gets spread across ~9x
// the pixels (each particle plots a single device pixel), so the field reads
// sparse + dim vs a DPR-2 desktop. Capping renders it at desktop density/
// brightness and is lighter on mobile GPUs.
const dpr = Math.min(window.devicePixelRatio || 1, 2)
let N = 30000

let canvas, ctx, containerEl
let W, H, pw, ph, imgData, pix, pix32

function resize() {
  if (!containerEl || !canvas || !ctx) return
  const r = containerEl.getBoundingClientRect()
  W = r.width; H = r.height
  if (W === 0 || H === 0) return
  pw = Math.round(W * dpr); ph = Math.round(H * dpr)
  canvas.width = pw; canvas.height = ph
  imgData = ctx.createImageData(pw, ph)
  pix = imgData.data
  pix32 = new Uint32Array(imgData.data.buffer)
}

function gaussRandom() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ════════════════════════════════════════════════════
// SHAPE GENERATORS
// ════════════════════════════════════════════════════

function genSphere() {
  const arr = new Float32Array(3 * N)
  for (let i = 0; i < N; i++) {
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    arr[i*3] = Math.sin(phi) * Math.cos(theta)
    arr[i*3+1] = Math.cos(phi)
    arr[i*3+2] = Math.sin(phi) * Math.sin(theta)
  }
  return arr
}

function genCube() {
  const arr = new Float32Array(3 * N)
  const s = 0.78
  for (let i = 0; i < N; i++) {
    const face = i % 6
    const u = (Math.random() * 2 - 1) * s
    const v = (Math.random() * 2 - 1) * s
    let x, y, z
    switch(face) {
      case 0: x = s; y = u; z = v; break
      case 1: x = -s; y = u; z = v; break
      case 2: x = u; y = s; z = v; break
      case 3: x = u; y = -s; z = v; break
      case 4: x = u; y = v; z = s; break
      case 5: x = u; y = v; z = -s; break
    }
    arr[i*3] = x; arr[i*3+1] = y; arr[i*3+2] = z
  }
  return arr
}

function genOctahedron() {
  const arr = new Float32Array(3 * N)
  for (let i = 0; i < N; i++) {
    let x = gaussRandom()
    let y = gaussRandom()
    let z = gaussRandom()
    const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) + 0.0001
    const s = 1.15
    arr[i*3]   = x / l1 * s
    arr[i*3+1] = y / l1 * s
    arr[i*3+2] = z / l1 * s
  }
  return arr
}

function genHexPrism() {
  const arr = new Float32Array(3 * N)
  const R = 0.82
  const HP = 0.82
  for (let i = 0; i < N; i++) {
    const r = Math.random()
    if (r < 0.15) {
      const face = Math.floor(Math.random() * 6)
      const a1 = face * Math.PI / 3
      const a2 = (face + 1) * Math.PI / 3
      const uu = Math.random(), vv = Math.random()
      const s = uu + vv > 1 ? [1 - uu, 1 - vv] : [uu, vv]
      arr[i*3]   = s[0] * Math.cos(a1) * R + s[1] * Math.cos(a2) * R
      arr[i*3+1] = HP
      arr[i*3+2] = s[0] * Math.sin(a1) * R + s[1] * Math.sin(a2) * R
    } else if (r < 0.30) {
      const face = Math.floor(Math.random() * 6)
      const a1 = face * Math.PI / 3
      const a2 = (face + 1) * Math.PI / 3
      const uu = Math.random(), vv = Math.random()
      const s = uu + vv > 1 ? [1 - uu, 1 - vv] : [uu, vv]
      arr[i*3]   = s[0] * Math.cos(a1) * R + s[1] * Math.cos(a2) * R
      arr[i*3+1] = -HP
      arr[i*3+2] = s[0] * Math.sin(a1) * R + s[1] * Math.sin(a2) * R
    } else {
      const face = Math.floor(Math.random() * 6)
      const a1 = face * Math.PI / 3
      const a2 = (face + 1) * Math.PI / 3
      const t = Math.random()
      arr[i*3]   = Math.cos(a1) * R * (1-t) + Math.cos(a2) * R * t
      arr[i*3+1] = (Math.random() * 2 - 1) * HP
      arr[i*3+2] = Math.sin(a1) * R * (1-t) + Math.sin(a2) * R * t
    }
  }
  return arr
}

function genTorus() {
  const arr = new Float32Array(3 * N)
  const R_m = 0.7, r_m = 0.3
  for (let i = 0; i < N; i++) {
    const u = Math.random() * Math.PI * 2
    const v = Math.random() * Math.PI * 2
    arr[i*3]   = (R_m + r_m * Math.cos(v)) * Math.cos(u)
    arr[i*3+1] = r_m * Math.sin(v)
    arr[i*3+2] = (R_m + r_m * Math.cos(v)) * Math.sin(u)
  }
  return arr
}

function genBlob() {
  const arr = new Float32Array(3 * N)
  for (let i = 0; i < N; i++) {
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    let x = Math.sin(phi) * Math.cos(theta)
    let y = Math.cos(phi)
    let z = Math.sin(phi) * Math.sin(theta)
    const d = 1 +
      Math.sin(x * 2.7 + y * 1.9) * 0.28 +
      Math.sin(y * 3.4 - z * 1.6) * 0.22 +
      Math.sin(z * 2.2 + x * 2.8) * 0.18 +
      Math.sin((x + y + z) * 3.1) * 0.12
    arr[i*3] = x * d; arr[i*3+1] = y * d; arr[i*3+2] = z * d
  }
  return arr
}

function genKlein() {
  const arr = new Float32Array(3 * N)
  const R = 1.2
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 * Math.PI
    const v = Math.random() * 2 * Math.PI
    const cosU2 = Math.cos(u/2), sinU2 = Math.sin(u/2)
    const sinV = Math.sin(v), sin2V = Math.sin(2*v)
    const factor = R + cosU2 * sinV - sinU2 * sin2V
    arr[i*3]   = factor * Math.cos(u) * 0.48
    arr[i*3+1] = (sinU2 * sinV + cosU2 * sin2V) * 0.48
    arr[i*3+2] = factor * Math.sin(u) * 0.48
  }
  return arr
}

function genDoubleHelix() {
  const arr = new Float32Array(3 * N)
  const turns = 3
  const maxT = turns * 2 * Math.PI
  const rad = 0.55
  const height = 1.8
  for (let i = 0; i < N; i++) {
    const r = Math.random()
    if (r < 0.88) {
      const strand = Math.floor(Math.random() * 2)
      const t = Math.random() * maxT
      const y = (t / maxT - 0.5) * height
      const angle = t + strand * Math.PI
      arr[i*3]   = rad * Math.cos(angle)
      arr[i*3+1] = y
      arr[i*3+2] = rad * Math.sin(angle)
    } else {
      const rungCount = 16
      const rung = Math.floor(Math.random() * rungCount)
      const tRung = (rung / rungCount) * maxT
      const t = Math.random()
      const y = (tRung / maxT - 0.5) * height
      const a1 = tRung
      const a2 = tRung + Math.PI
      const x1 = rad * Math.cos(a1), z1 = rad * Math.sin(a1)
      const x2 = rad * Math.cos(a2), z2 = rad * Math.sin(a2)
      arr[i*3]   = x1 + (x2 - x1) * t
      arr[i*3+1] = y
      arr[i*3+2] = z1 + (z2 - z1) * t
    }
  }
  return arr
}

function genLorenz() {
  const arr = new Float32Array(3 * N)
  const sigma = 10, rho = 28, beta = 8/3
  let x = 0.1, y = 0, z = 0
  const dt = 0.005

  for (let i = 0; i < 3000; i++) {
    const dx = sigma * (y - x)
    const dy = x * (rho - z) - y
    const dz = x * y - beta * z
    x += dx * dt; y += dy * dt; z += dz * dt
  }

  const pts = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 3; j++) {
      const dx = sigma * (y - x)
      const dy = x * (rho - z) - y
      const dz = x * y - beta * z
      x += dx * dt; y += dy * dt; z += dz * dt
    }
    pts[i*3] = x; pts[i*3+1] = y; pts[i*3+2] = z
  }

  let xMin = Infinity, xMax = -Infinity
  let yMin = Infinity, yMax = -Infinity
  let zMin = Infinity, zMax = -Infinity
  for (let i = 0; i < N; i++) {
    if (pts[i*3] < xMin) xMin = pts[i*3]
    if (pts[i*3] > xMax) xMax = pts[i*3]
    if (pts[i*3+1] < yMin) yMin = pts[i*3+1]
    if (pts[i*3+1] > yMax) yMax = pts[i*3+1]
    if (pts[i*3+2] < zMin) zMin = pts[i*3+2]
    if (pts[i*3+2] > zMax) zMax = pts[i*3+2]
  }
  const ccx = (xMin + xMax) / 2
  const ccy = (yMin + yMax) / 2
  const ccz = (zMin + zMax) / 2
  const maxExt = Math.max(xMax - xMin, yMax - yMin, zMax - zMin)
  const s = 1.9 / maxExt

  for (let i = 0; i < N; i++) {
    arr[i*3]   = (pts[i*3]   - ccx) * s
    arr[i*3+1] = (pts[i*3+1] - ccy) * s
    arr[i*3+2] = (pts[i*3+2] - ccz) * s
  }
  return arr
}

function genManifold() {
  const arr = new Float32Array(3 * N)
  const ringR = 0.9
  const thickness = 0.035
  for (let i = 0; i < N; i++) {
    const ring = i % 3
    const u = Math.random() * 2 * Math.PI
    let x = 0, y = 0, z = 0
    if (ring === 0) {
      x = ringR * Math.cos(u)
      y = ringR * Math.sin(u)
    } else if (ring === 1) {
      y = ringR * Math.cos(u)
      z = ringR * Math.sin(u)
    } else {
      x = ringR * Math.cos(u)
      z = ringR * Math.sin(u)
    }
    arr[i*3]   = x + (Math.random() - 0.5) * thickness
    arr[i*3+1] = y + (Math.random() - 0.5) * thickness
    arr[i*3+2] = z + (Math.random() - 0.5) * thickness
  }
  return arr
}

function genEcho() {
  const arr = new Float32Array(3 * N)
  const radii = [0.38, 0.68, 0.98]
  const weights = [0.15, 0.30, 0.55]
  for (let i = 0; i < N; i++) {
    const r = Math.random()
    let shellIdx = 0
    let cum = 0
    for (let s = 0; s < 3; s++) {
      cum += weights[s]
      if (r < cum) { shellIdx = s; break }
    }
    const rad = radii[shellIdx]
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    arr[i*3]   = rad * Math.sin(phi) * Math.cos(theta)
    arr[i*3+1] = rad * Math.cos(phi)
    arr[i*3+2] = rad * Math.sin(phi) * Math.sin(theta)
  }
  return arr
}

function genMobius() {
  const arr = new Float32Array(3 * N)
  const R = 0.9
  const width = 0.35
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 * Math.PI
    const v = (Math.random() * 2 - 1) * width
    const x = (R + v * Math.cos(u/2)) * Math.cos(u)
    const y = (R + v * Math.cos(u/2)) * Math.sin(u)
    const z = v * Math.sin(u/2)
    arr[i*3]   = x * 0.95
    arr[i*3+1] = z * 0.95
    arr[i*3+2] = y * 0.95
  }
  return arr
}

// ── Geometric solids (face-sampled) ─────────────────────────────────────────
// Added for agent identity shapes (indices 12-14). Kept identical to
// src/lib/genesisShapes.ts so an agent's birth shape matches its empty-thread
// shape exactly. The auto-cycle stays `% 12`, so these are only reachable via
// setShape() — the composer's default behavior is unchanged.
function _normVerts(raw, scale) {
  return raw.map(([x, y, z]) => {
    const L = Math.hypot(x, y, z) || 1
    return [(x / L) * scale, (y / L) * scale, (z / L) * scale]
  })
}
function _sampleTriangles(verts, tris) {
  const arr = new Float32Array(3 * N)
  for (let i = 0; i < N; i++) {
    const tri = tris[(Math.random() * tris.length) | 0]
    let u = Math.random(), v = Math.random()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    const w = 1 - u - v
    const a = verts[tri[0]], b = verts[tri[1]], c = verts[tri[2]]
    arr[i*3]   = a[0]*w + b[0]*u + c[0]*v
    arr[i*3+1] = a[1]*w + b[1]*u + c[1]*v
    arr[i*3+2] = a[2]*w + b[2]*u + c[2]*v
  }
  return arr
}
function genTetrahedron() {
  const verts = _normVerts([[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]], 1.3)
  return _sampleTriangles(verts, [[0,1,2],[0,1,3],[0,2,3],[1,2,3]])
}
function genIcosahedron() {
  const p = (1 + Math.sqrt(5)) / 2
  const verts = _normVerts([
    [-1,p,0],[1,p,0],[-1,-p,0],[1,-p,0],
    [0,-1,p],[0,1,p],[0,-1,-p],[0,1,-p],
    [p,0,-1],[p,0,1],[-p,0,-1],[-p,0,1],
  ], 1.12)
  const tris = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ]
  return _sampleTriangles(verts, tris)
}
function genHexBipyramid() {
  const R = 0.92, h = 1.18
  const verts = []
  for (let k = 0; k < 6; k++) { const a = k*Math.PI/3; verts.push([R*Math.cos(a),0,R*Math.sin(a)]) }
  verts.push([0,h,0]); verts.push([0,-h,0])
  const tris = []
  for (let k = 0; k < 6; k++) { const nx=(k+1)%6; tris.push([6,k,nx]); tris.push([7,nx,k]) }
  return _sampleTriangles(verts, tris)
}

const shapeGenerators = [
  genSphere, genCube, genOctahedron, genHexPrism, genTorus, genBlob,
  genKlein, genDoubleHelix, genLorenz, genManifold, genEcho, genMobius,
  genTetrahedron, genIcosahedron, genHexBipyramid
]

let HOMES = []

// ════════════════════════════════════════════════════
// PARTICLE STATE ARRAYS
// ════════════════════════════════════════════════════

let SX_CUR, SY_CUR, VX, VY, PH, DLAYER, WM, EXC, PFREQ
let THETA_S, PHI_S
const BANDS = [
  { l: 2, m: 0, freq: 1.8,  phase: 0.0, weight: 0.14 },
  { l: 3, m: 2, freq: 4.7,  phase: 1.3, weight: 0.10 },
  { l: 4, m: 1, freq: 7.3,  phase: 2.7, weight: 0.08 },
  { l: 5, m: 3, freq: 11.2, phase: 0.8, weight: 0.06 },
  { l: 6, m: 4, freq: 14.1, phase: 2.1, weight: 0.05 }
]
let HARMONICS

function initParticles() {
  HOMES = shapeGenerators.map(fn => fn())

  SX_CUR = new Float32Array(N)
  SY_CUR = new Float32Array(N)
  VX = new Float32Array(N)
  VY = new Float32Array(N)
  PH = new Float32Array(N)
  DLAYER = new Float32Array(N)
  WM = new Float32Array(N)
  EXC = new Float32Array(N)
  PFREQ = new Float32Array(N)
  THETA_S = new Float32Array(N)
  PHI_S = new Float32Array(N)
  HARMONICS = BANDS.map(() => new Float32Array(N))

  for (let i = 0; i < N; i++) {
    const sx = HOMES[0][i*3]
    const sy = HOMES[0][i*3+1]
    const sz = HOMES[0][i*3+2]
    THETA_S[i] = Math.atan2(sz, sx)
    PHI_S[i] = Math.acos(Math.max(-1, Math.min(1, sy)))

    PH[i] = Math.random() * Math.PI * 2
    DLAYER[i] = Math.random()
    WM[i] = Math.random() * 0.4
    EXC[i] = 0
    PFREQ[i] = 0.8 + Math.random() * 0.4

    SX_CUR[i] = W / 2
    SY_CUR[i] = H / 2

    for (let b = 0; b < BANDS.length; b++) {
      const band = BANDS[b]
      HARMONICS[b][i] = Math.sin(band.l * PHI_S[i]) * Math.cos(band.m * THETA_S[i])
    }
  }
}

// ════════════════════════════════════════════════════
// MORPH / FOCUS / RIPPLE / CONTAGION
// ════════════════════════════════════════════════════

let currentShape = 0
let targetShape = 0
let morphStart = 0
let morphDuration = 2.8
let nextMorphTime = 5
let manualShape = null
// Snapshot of particles' currently-interpolated home positions. Updated on
// every triggerManualMorph() call so chained shape changes (toggling Agent
// off + Ensemble on while particles are still mid-flight, etc.) start from
// where particles ACTUALLY are instead of snapping back to currentShape's
// home. null until the first manual shape change.
let currentHomes = null

function updateMorph(elapsed, justEntered) {
  if (justEntered) {
    morphStart = elapsed - morphDuration
    nextMorphTime = elapsed + 4
  }

  const sinceMorph = elapsed - morphStart
  const progress = sinceMorph / morphDuration

  if (progress >= 1 && elapsed >= nextMorphTime && manualShape === null) {
    currentShape = targetShape
    // Cycle through the 12 organic shapes (0-11), skip capsule (12)
    targetShape = (targetShape + 1) % 12
    morphStart = elapsed
    nextMorphTime = elapsed + morphDuration + 5 + Math.random() * 3
  }

  return Math.max(0, Math.min(1, progress))
}

function smoothstep(t) { return t * t * (3 - 2 * t) }

function triggerManualMorph(shapeIdx, elapsed) {
  // Allocate the live-source buffer the first time we ever do a manual
  // morph; on first call particles are at rest at currentShape's home.
  if (!currentHomes || currentHomes.length !== N * 3) {
    currentHomes = new Float32Array(N * 3)
    const baseHome = HOMES[currentShape]
    if (baseHome) currentHomes.set(baseHome)
  }

  // Capture in-flight position as the new source. currentHomes BEFORE this
  // update is the previous source (either HOMES[currentShape] copy on the
  // first call, or the snapshot from the previous trigger). dst is the
  // PREVIOUS targetShape's homes (we haven't updated targetShape yet), and
  // morphT is the smoothstep progress of the in-flight morph. After this
  // loop, currentHomes equals: prevSource * (1-t) + prevTarget * t — i.e.
  // exactly where the home interpolation was when this trigger fired. The
  // new morph then eases from currentHomes → HOMES[shapeIdx] without any
  // snap-back to the original currentShape.
  const sinceMorph = elapsed - morphStart
  const progress = Math.max(0, Math.min(1, sinceMorph / morphDuration))
  const morphT = smoothstep(progress)
  const oldDst = HOMES[targetShape]
  if (oldDst) {
    for (let i = 0; i < N * 3; i++) {
      currentHomes[i] = currentHomes[i] * (1 - morphT) + oldDst[i] * morphT
    }
  }

  manualShape = shapeIdx
  targetShape = shapeIdx
  morphStart = elapsed
  nextMorphTime = Infinity
}

let focusX = 0, focusY = 0, focusZ = 0
let focusVX = 0, focusVY = 0, focusVZ = 0

function updateFocus() {
  focusVX += (Math.random() - 0.5) * 0.003
  focusVY += (Math.random() - 0.5) * 0.003
  focusVZ += (Math.random() - 0.5) * 0.003
  focusVX *= 0.985; focusVY *= 0.985; focusVZ *= 0.985
  focusX += focusVX; focusY += focusVY; focusZ += focusVZ

  const d2 = focusX*focusX + focusY*focusY + focusZ*focusZ
  if (d2 > 0.64) {
    focusX *= 0.97; focusY *= 0.97; focusZ *= 0.97
  }
}

const MAX_RIPPLES = 6
const RIPPLES = new Float32Array(MAX_RIPPLES * 6)
let activeRipples = 0

function addRipple(x, y, z) {
  if (activeRipples >= MAX_RIPPLES) {
    let oldestIdx = 0
    let oldestAge = -1
    for (let i = 0; i < MAX_RIPPLES; i++) {
      if (RIPPLES[i*6+3] > oldestAge) {
        oldestAge = RIPPLES[i*6+3]
        oldestIdx = i
      }
    }
    const o = oldestIdx * 6
    RIPPLES[o] = x; RIPPLES[o+1] = y; RIPPLES[o+2] = z
    RIPPLES[o+3] = 0
    RIPPLES[o+4] = 1.2
    RIPPLES[o+5] = 1.4
    return
  }
  const o = activeRipples * 6
  RIPPLES[o] = x; RIPPLES[o+1] = y; RIPPLES[o+2] = z
  RIPPLES[o+3] = 0
  RIPPLES[o+4] = 1.2
  RIPPLES[o+5] = 1.4
  activeRipples++
}

function updateRipples(dt) {
  for (let i = activeRipples - 1; i >= 0; i--) {
    const o = i * 6
    RIPPLES[o+3] += dt
    if (RIPPLES[o+3] > RIPPLES[o+4]) {
      if (i < activeRipples - 1) {
        const lo = (activeRipples - 1) * 6
        for (let j = 0; j < 6; j++) RIPPLES[o+j] = RIPPLES[lo+j]
      }
      activeRipples--
    }
  }
}

let contagion = 0

// ════════════════════════════════════════════════════
// STATE & SIMULATED AUDIO
// ════════════════════════════════════════════════════

let state = 'idle'
let prevState = 'idle'
let time = 0
let lastFrameTime = 0
let amp = 0, tAmp = 0

function simAudio() {
  const t = time * 0.003
  if (state === 'speaking') {
    const env = Math.max(0,
      Math.sin(t * 1.8) * 0.3 + Math.sin(t * 4.7) * 0.25 +
      Math.sin(t * 0.5) * 0.25 + Math.sin(t * 11) * 0.12)
    const pause = Math.sin(t * 0.35) > 0.25 ? 1 : 0.1
    tAmp = Math.min(1, env * pause)
  } else if (state === 'listening') {
    tAmp = Math.max(0, Math.sin(t * 2.3) * 0.12 + Math.sin(t * 5.7) * 0.08) * 0.5
  } else {
    tAmp = 0
  }
  amp += (tAmp - amp) * 0.08
}

// ════════════════════════════════════════════════════
// RENDER LOOP
// ════════════════════════════════════════════════════

let rafId = null
let frameCount = 0
let lastFpsTime = performance.now()

// ════════════════════════════════════════════════════
// DISSOLVE SYSTEM — graceful ascend/descend
// ════════════════════════════════════════════════════

let dissolveProgress = 0      // 0 = fully formed, 1 = fully dissolved
let dissolveDirection = 0     // 0 = none, 1 = dissolving out, -1 = reforming
let dissolveStartTime = 0
const DISSOLVE_DURATION = 2.0 // seconds for full dissolve
let onDissolveComplete = null // callback when dissolve finishes

// Per-particle dissolve offsets for staggered, organic dissolution
// Each particle gets a slightly different dissolve timing
let DISSOLVE_DELAY = null
let DISSOLVE_DRIFT = null     // per-particle random upward drift speed

function initDissolveArrays() {
  DISSOLVE_DELAY = new Float32Array(N)
  DISSOLVE_DRIFT = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    // Stagger: particles near the top dissolve first (based on their Y home position)
    const homeY = HOMES[0] ? HOMES[0][i*3+1] : 0
    // homeY ranges roughly -1 to 1, top particles (negative Y) go first
    const yBias = (1 - homeY) * 0.5 // 0 to 1, top-heavy
    DISSOLVE_DELAY[i] = yBias * 0.3 + Math.random() * 0.2
    // Random upward drift speed — slight variation for organic feel
    DISSOLVE_DRIFT[i] = 0.6 + Math.random() * 0.8
  }
}

// Smooth ease for dissolve — slow start, slow end
function dissolveEase(t) {
  // Sine ease in-out
  return -(Math.cos(Math.PI * t) - 1) / 2
}

function render(ts) {
  rafId = requestAnimationFrame(render)

  if (!pix || !imgData) return

  const dt = Math.min(0.05, (ts - lastFrameTime) * 0.001)
  lastFrameTime = ts
  time = ts
  const elapsed = time * 0.001
  simAudio()

  pix32.fill(0)

  // Update dissolve progress
  if (dissolveDirection !== 0) {
    const dissolveElapsed = elapsed - dissolveStartTime
    const rawProgress = Math.min(1, dissolveElapsed / DISSOLVE_DURATION)

    if (dissolveDirection === 1) {
      dissolveProgress = dissolveEase(rawProgress)
    } else {
      dissolveProgress = 1 - dissolveEase(rawProgress)
    }

    if (rawProgress >= 1) {
      dissolveDirection = 0
      if (onDissolveComplete) {
        const cb = onDissolveComplete
        onDissolveComplete = null
        cb()
      }
    }
  }

  const cx = W / 2
  const cy = H / 2
  const baseSize = Math.min(W, H) * 0.30

  const justEntered = state === 'thinking' && prevState !== 'thinking'
  const morphActive = state === 'thinking' || manualShape !== null
  const morphProgress = morphActive ? updateMorph(elapsed, justEntered) : 0
  prevState = state

  const morphT = smoothstep(morphProgress)
  // Use the live-source snapshot when manual morphs are in play so chained
  // shape changes morph from where particles actually are. Falls back to
  // HOMES[currentShape] for auto-cycle (where currentShape is advanced
  // explicitly by updateMorph).
  const srcHomes = (manualShape !== null && currentHomes) ? currentHomes : HOMES[currentShape]
  const dstHomes = HOMES[targetShape]

  if (!srcHomes || !dstHomes) return

  const rotY = elapsed * 0.12
  const rotX = Math.sin(elapsed * 0.08) * 0.3 +
               (state === 'thinking' ? Math.sin(elapsed * 0.05) * 0.2 : 0)
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY)
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX)

  const bandAmps = new Float32Array(BANDS.length)
  for (let b = 0; b < BANDS.length; b++) {
    const band = BANDS[b]
    const osc = Math.sin(elapsed * band.freq + band.phase)
    const baseline = state === 'idle' || state === 'thinking' ? 0.15 : 0.25
    const audioMult = 1 + amp * 3.5
    bandAmps[b] = osc * band.weight * baseline * audioMult
  }

  const breath = Math.sin(elapsed * 0.3) * 0.025

  updateFocus()
  updateRipples(dt)

  const baseExcRate = 0.0002 + amp * 0.004 +
    (state === 'thinking' && morphProgress < 1 ? 0.001 : 0)

  for (let i = 0; i < N; i++) {
    let px = srcHomes[i*3]   * (1 - morphT) + dstHomes[i*3]   * morphT
    let py = srcHomes[i*3+1] * (1 - morphT) + dstHomes[i*3+1] * morphT
    let pz = srcHomes[i*3+2] * (1 - morphT) + dstHomes[i*3+2] * morphT

    let cymaticD = breath
    for (let b = 0; b < BANDS.length; b++) {
      cymaticD += HARMONICS[b][i] * bandAmps[b]
    }
    const radialScale = 1 + cymaticD
    px *= radialScale
    py *= radialScale
    pz *= radialScale

    const fdx = px - focusX
    const fdy = py - focusY
    const fdz = pz - focusZ
    const focusD2 = fdx*fdx + fdy*fdy + fdz*fdz
    let focusBoost = 0
    if (focusD2 < 0.25) {
      focusBoost = (1 - focusD2 / 0.25) * 0.25
    }

    let rippleExciteChance = 0
    for (let r = 0; r < activeRipples; r++) {
      const o = r * 6
      const rdx = px - RIPPLES[o]
      if (rdx > 0.5 || rdx < -0.5) continue
      const rdy = py - RIPPLES[o+1]
      if (rdy > 0.5 || rdy < -0.5) continue
      const rdz = pz - RIPPLES[o+2]
      if (rdz > 0.5 || rdz < -0.5) continue
      const rd = Math.sqrt(rdx*rdx + rdy*rdy + rdz*rdz)
      const rAge = RIPPLES[o+3]
      const rMaxAge = RIPPLES[o+4]
      const rMaxR = RIPPLES[o+5]
      const curRadius = (rAge / rMaxAge) * rMaxR
      const distFromFront = Math.abs(rd - curRadius)
      if (distFromFront < 0.12) {
        const ageRatio = 1 - rAge / rMaxAge
        const frontStrength = 1 - distFromFront / 0.12
        rippleExciteChance += ageRatio * frontStrength * 0.05
      }
    }

    const x1 = px * cosY + pz * sinY
    const z1 = -px * sinY + pz * cosY
    const y1 = py * cosX - z1 * sinX
    const z2 = py * sinX + z1 * cosX

    const perspective = 3
    const scale = perspective / (perspective + z2)
    const targetX = cx + x1 * scale * baseSize
    const targetY = cy + y1 * scale * baseSize

    const sp = 0.08
    VX[i] += (targetX - SX_CUR[i]) * sp
    VY[i] += (targetY - SY_CUR[i]) * sp

    // Dissolve physics — upward drift with gentle scatter
    if (dissolveProgress > 0 && DISSOLVE_DELAY) {
      // Per-particle staggered progress
      const pDelay = DISSOLVE_DELAY[i]
      const pProgress = Math.max(0, Math.min(1, (dissolveProgress - pDelay) / (1 - pDelay)))

      if (pProgress > 0) {
        // Upward drift — accelerates gently with progress
        const driftStrength = pProgress * pProgress * DISSOLVE_DRIFT[i] * baseSize * 0.015
        VY[i] -= driftStrength

        // Gentle horizontal scatter — particles spread outward slightly
        const scatterX = (Math.sin(PH[i] * 3 + elapsed * 0.5) * 0.3) * pProgress * baseSize * 0.003
        VX[i] += scatterX

        // Weaken the spring attraction as dissolve progresses
        // so particles drift free rather than snapping back
        VX[i] *= 1 - pProgress * 0.15
        VY[i] *= 1 - pProgress * 0.08
      }
    }

    VX[i] *= 0.82
    VY[i] *= 0.82
    SX_CUR[i] += VX[i]
    SY_CUR[i] += VY[i]

    const sxPx = (SX_CUR[i] * dpr + 0.5) | 0
    const syPx = (SY_CUR[i] * dpr + 0.5) | 0
    if (sxPx < 0 || sxPx >= pw || syPx < 0 || syPx >= ph) continue

    // Excitation only runs for visible particles — contagion is a visual effect
    EXC[i] *= 0.985
    const excProb = baseExcRate + contagion * 0.002 + rippleExciteChance
    if (Math.random() < excProb) {
      EXC[i] = Math.max(EXC[i], 0.7 + Math.random() * 0.3)
      contagion = Math.min(1, contagion + 0.012)
      if (EXC[i] > 0.85 && Math.random() < 0.04) {
        addRipple(px, py, pz)
      }
    }

    const depthNorm = (z2 + 1.2) * 0.417
    const depthClamp = Math.max(0, Math.min(1, depthNorm))
    const layerBright = 0.35 + DLAYER[i] * 0.55

    let a = 0.04 + layerBright * 0.35 + depthClamp * 0.25

    if (state === 'idle') a *= 0.62
    else if (state === 'listening') a *= 0.72 + amp * 0.3
    else if (state === 'speaking') a *= 0.58 + amp * 0.6
    else if (state === 'thinking') a *= 0.70
    if (manualShape !== null && state !== 'thinking') a *= 0.66

    a += EXC[i] * 0.55
    a += focusBoost

    const cymaticMag = Math.abs(cymaticD) * 2
    a += cymaticMag * amp * 0.5

    a *= 0.88 + Math.sin(time * 0.0008 * PFREQ[i] + PH[i]) * 0.12

    // Dissolve alpha fade — staggered per particle for organic dissolution
    if (dissolveProgress > 0 && DISSOLVE_DELAY) {
      const pDelay = DISSOLVE_DELAY[i]
      const pProgress = Math.max(0, Math.min(1, (dissolveProgress - pDelay) / (1 - pDelay)))
      // Smooth fade: particles become transparent as they drift
      a *= 1 - pProgress
    }

    a = Math.min(1, Math.max(0, a))
    if (a < 0.015) continue

    const exciteWarm = EXC[i] * 0.5
    const audioWarm = amp * 0.35
    const focusWarm = focusBoost * 0.8
    const wb = WM[i] * 0.4 + audioWarm + exciteWarm + focusWarm

    let r = 172 + wb * 60 + depthClamp * 22
    let g = 168 + wb * 28 + depthClamp * 18
    let b = 162 - wb * 15 + depthClamp * 12

    if (EXC[i] > 0.3) {
      const gb = (EXC[i] - 0.3) * 1.4
      r = Math.min(255, r + gb * 30)
      g = Math.min(255, g + gb * 15)
      b = Math.max(0, b - gb * 20)
    }

    r = Math.min(255, r | 0)
    g = Math.min(255, g | 0)
    b = Math.min(255, b | 0)

    const pidx = syPx * pw + sxPx
    const al = (a * 255) | 0

    if (pix32[pidx] !== 0) {
      const idx = pidx * 4
      pix[idx]   = Math.min(255, pix[idx]   + ((r * a * 0.55) | 0))
      pix[idx+1] = Math.min(255, pix[idx+1] + ((g * a * 0.55) | 0))
      pix[idx+2] = Math.min(255, pix[idx+2] + ((b * a * 0.55) | 0))
      pix[idx+3] = Math.min(255, pix[idx+3] + ((al * 0.55) | 0))
    } else {
      pix32[pidx] = (al << 24) | (b << 16) | (g << 8) | r
    }

    const shouldBloom = (depthClamp > 0.6 && a > 0.15) || EXC[i] > 0.4 || focusBoost > 0.1
    if (shouldBloom) {
      const bloomStr = EXC[i] > 0.4 ? 0.45 : 0.28
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue
          const nx = sxPx + ox
          const ny = syPx + oy
          if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) continue
          const nidx = ny * pw + nx
          const dist = Math.abs(ox) + Math.abs(oy)
          const falloff = 1 / (1 + dist)
          const ba = a * bloomStr * falloff
          const ni = nidx * 4
          pix[ni]   = Math.min(255, pix[ni]   + ((r * ba) | 0))
          pix[ni+1] = Math.min(255, pix[ni+1] + ((g * ba) | 0))
          pix[ni+2] = Math.min(255, pix[ni+2] + ((b * ba) | 0))
          pix[ni+3] = Math.min(255, pix[ni+3] + ((ba * 255) | 0))
        }
      }
    }
  }

  contagion *= 0.93

  ctx.putImageData(imgData, 0, 0)

  frameCount++
  rafId = rafId // keep reference alive
}

// ════════════════════════════════════════════════════
// MODULE API
// ════════════════════════════════════════════════════

return {
  init(canvasEl, container) {
    canvas = canvasEl
    ctx = canvas.getContext('2d')
    containerEl = container
    resize()
    initParticles()
    lastFrameTime = performance.now()
    rafId = requestAnimationFrame(render)
  },

  setState(newState) {
    // State controls audio simulation / cymatic behavior. Shape selection
    // is a separate concern controlled by setShape(); state changes must
    // not reset the manual shape lock or particles will jump back into
    // auto-cycle whenever the user toggles dictation/streaming.
    state = newState
    if (state === 'thinking') {
      nextMorphTime = time * 0.001 + 4
    }
  },

  setShape(shapeIndex) {
    const elapsed = time * 0.001
    triggerManualMorph(shapeIndex, elapsed)
  },

  resize() {
    resize()
  },

  setParticleCount(newN) {
    N = newN
    resize()
    initParticles()
  },

  // Dissolve out — particles ascend and fade
  dissolveOut(callback) {
    if (!DISSOLVE_DELAY) initDissolveArrays()
    dissolveDirection = 1
    dissolveStartTime = time * 0.001
    dissolveProgress = 0
    onDissolveComplete = callback || null
  },

  // Reform — particles descend and coalesce back into sphere
  dissolveIn() {
    if (!DISSOLVE_DELAY) initDissolveArrays()
    dissolveDirection = -1
    dissolveStartTime = time * 0.001
    dissolveProgress = 1
    onDissolveComplete = null
    // Reset particle positions to center so they reform naturally
    for (let i = 0; i < N; i++) {
      SX_CUR[i] = W / 2 + (Math.random() - 0.5) * W * 0.3
      SY_CUR[i] = -H * 0.2 + Math.random() * H * 0.3
      VX[i] = 0
      VY[i] = 0
    }
  },

  destroy() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }
}

}

// Default export is a singleton — one engine per page. If we ever need
// multiple instances on the same screen, switch consumers to call
// `createExpressiveField()` themselves.
const singleton = createExpressiveField()
export default singleton
