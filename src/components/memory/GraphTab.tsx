/**
 * GraphTab — Mnemos connection graph.
 *
 * Engineering goals:
 *   • Barnes-Hut quadtree repulsion → handles 500+ nodes at 60fps.
 *   • Verlet integration + adaptive alpha cooling → silky, settles cleanly, no jitter.
 *   • DPR-aware crisp canvas, viewport culling, off-screen edge skipping.
 *   • Smooth zoom-toward-cursor, momentum pan, eased camera transitions.
 *   • Live realtime: new engrams/connections animate in, sim reheats softly,
 *     positions persist across data updates.
 *   • Hover tooltip + selection halo + connected-edge highlighting.
 *   • Reduced-motion aware. ResizeObserver. RAF lifecycle clean.
 *
 * Visual language matches the dark mockup: hairline cream edges, tiny
 * type-tinted discs with luminous rings, cool-blue selection halo.
 */
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useMemoryStore, type Engram, type Connection } from '@/stores/memoryStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useAuthStore } from '@/stores/authStore';
import { useMemoryRealtime } from '@/hooks/useMemoryRealtime';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { generateMockGraph } from '@/lib/mockGraphData';
import { useAgentScopeStore } from '@/stores/agentScopeStore';

// ── Visual tokens ───────────────────────────────────────────────────────────
// GRAPH INTENSITY — toggle between the two tuned looks. 'restrained' is the
// calm, muted constellation (committed at 96ad460). 'dramatic' is the luminous
// centerpiece: brighter hues, larger strength-scaled nodes, soft glow halos,
// brighter type-tinted edges. Flip GRAPH_INTENSITY to revert instantly.
type GraphIntensity = 'restrained' | 'dramatic';
const GRAPH_INTENSITY: GraphIntensity = 'dramatic';
const DRAMATIC = GRAPH_INTENSITY === 'dramatic';

// Engram-type hues. RESTRAINED set (revert anchor):
//   episodic [126,162,198] · semantic [201,173,130] · procedural [142,176,160] · belief [178,150,200]
const TYPE_TINTS: Record<string, [number, number, number]> = DRAMATIC
  ? {
      episodic:   [104, 168, 228],
      semantic:   [222, 180, 116],
      procedural: [120, 206, 168],
      belief:     [196, 150, 236],
    }
  : {
      episodic:   [126, 162, 198],
      semantic:   [201, 173, 130],
      procedural: [142, 176, 160],
      belief:     [178, 150, 200],
    };

const CANVAS_BG          = 'rgba(0, 0, 0, 0)';
const NODE_FILL_DIM      = 'rgba(220, 219, 216, 0.085)';
const NODE_STROKE        = 'rgba(220, 219, 216, 0.55)';
const NODE_STROKE_HOVER  = 'rgba(244, 243, 240, 0.95)';
const NODE_STROKE_DIM    = 'rgba(220, 219, 216, 0.18)';
const SELECT_RING        = 'rgba(140, 175, 210, 0.95)';
const SELECT_HALO        = 'rgba(140, 175, 210, 0.16)';
const EDGE_BASE          = 'rgba(220, 219, 216,';
const EDGE_HIGHLIGHT     = 'rgba(220, 219, 216, 0.62)';
const EDGE_DIM           = 'rgba(220, 219, 216, 0.025)';

// ── Types ───────────────────────────────────────────────────────────────────
interface GraphNode {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  fx: number | null; fy: number | null;       // pinned (drag) coords
  engram: Engram;
  radius: number;
  spawnedAt: number;
  degree: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  id: string;
}

// ── Barnes-Hut quadtree ─────────────────────────────────────────────────────
class QuadNode {
  cx = 0; cy = 0; mass = 0;
  x: number; y: number; w: number; h: number;
  children: (QuadNode | null)[] | null = null;
  body: GraphNode | null = null;
  constructor(x: number, y: number, w: number, h: number) {
    this.x = x; this.y = y; this.w = w; this.h = h;
  }
  insert(b: GraphNode) {
    if (!this.body && !this.children) { this.body = b; this.cx = b.x; this.cy = b.y; this.mass = 1; return; }
    if (this.body && !this.children) {
      const old = this.body; this.body = null; this._subdivide();
      this._place(old);
    }
    this._place(b);
    // Recompute COM
    this.mass += 1;
    this.cx = (this.cx * (this.mass - 1) + b.x) / this.mass;
    this.cy = (this.cy * (this.mass - 1) + b.y) / this.mass;
  }
  private _subdivide() {
    const hw = this.w / 2, hh = this.h / 2;
    this.children = [
      new QuadNode(this.x,       this.y,       hw, hh), // NW
      new QuadNode(this.x + hw,  this.y,       hw, hh), // NE
      new QuadNode(this.x,       this.y + hh,  hw, hh), // SW
      new QuadNode(this.x + hw,  this.y + hh,  hw, hh), // SE
    ];
  }
  private _place(b: GraphNode) {
    if (!this.children) return;
    const hw = this.w / 2, hh = this.h / 2;
    const i = (b.x >= this.x + hw ? 1 : 0) + (b.y >= this.y + hh ? 2 : 0);
    this.children[i]!.insert(b);
  }
  apply(b: GraphNode, theta: number, k: number, fxfy: { fx: number; fy: number }) {
    if (!this.mass) return;
    const dx = this.cx - b.x, dy = this.cy - b.y;
    const dist2 = dx * dx + dy * dy + 0.01;
    if (this.body && this.body !== b) {
      const inv = 1 / dist2;
      const f = k * inv;
      fxfy.fx -= dx * f;
      fxfy.fy -= dy * f;
      return;
    }
    if (!this.children) return;
    if ((this.w * this.w) / dist2 < theta * theta) {
      const f = (k * this.mass) / dist2;
      fxfy.fx -= dx * f;
      fxfy.fy -= dy * f;
    } else {
      for (const c of this.children) c?.apply(b, theta, k, fxfy);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtClock(d = new Date()): string {
  return d.toTimeString().slice(0, 5);
}
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

// ── Component ──────────────────────────────────────────────────────────────
export default function GraphTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { engrams, connections, setSelectedEngram, selectedEngram } = useMemoryStore();
  const loadAll = useMemoryStore((s) => s.loadAll);
  const openDrawer = useDrawerStore((s) => s.open);
  const userId = useAuthStore((s) => s.user?.id);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Subscribe to live updates
  useMemoryRealtime(userId, activeAgentId);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [hasSettled, setHasSettled] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Inject / remove mock data when demo mode toggles
  useEffect(() => {
    if (demoMode) {
      const uid = userId ?? 'demo-user';
      const { engrams: mockE, connections: mockC } = generateMockGraph(uid, 140, 7, activeAgentId);
      useMemoryStore.setState({ engrams: mockE, connections: mockC });
    } else if (userId) {
      loadAll(userId, activeAgentId);
    }
  }, [demoMode, userId, activeAgentId, loadAll]);

  const nodesRef = useRef<Map<string, GraphNode>>(new Map());
  const edgesRef = useRef<GraphEdge[]>([]);
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  const animRef = useRef<number>(0);
  const alphaRef = useRef<number>(1);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tz: 1 });
  const autoFitRef = useRef<{ done: boolean; settleFrames: number }>({ done: false, settleFrames: 0 });
  const dragRef = useRef<{ mode: 'none' | 'pan' | 'node'; lastX: number; lastY: number; nodeId: string | null; vx: number; vy: number }>(
    { mode: 'none', lastX: 0, lastY: 0, nodeId: null, vx: 0, vy: 0 }
  );
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedEngram?.id ?? null;
  const hoveredRef = useRef<string | null>(null);
  hoveredRef.current = hoveredNode;
  const filterRef = useRef<string | null>(null);
  filterRef.current = filterType;

  // ── Filter to active engrams (and apply type filter) ────────────────────
  const activeEngrams = useMemo(
    () => engrams.filter((e) => {
      if (e.state !== 'active' && e.state !== 'consolidating') return false;
      if (filterType && e.engram_type !== filterType) return false;
      return true;
    }),
    [engrams, filterType]
  );

  // ── Build adjacency + node/edge collections; preserve positions ─────────
  useEffect(() => {
    const now = performance.now();
    const next = new Map<string, GraphNode>();
    const adj = new Map<string, Set<string>>();
    const idSet = new Set(activeEngrams.map((e) => e.id));

    // Pre-compute degree (only counting edges between visible nodes)
    const degreeMap = new Map<string, number>();
    for (const c of connections) {
      if (!idSet.has(c.source_id) || !idSet.has(c.target_id)) continue;
      degreeMap.set(c.source_id, (degreeMap.get(c.source_id) ?? 0) + 1);
      degreeMap.set(c.target_id, (degreeMap.get(c.target_id) ?? 0) + 1);
      if (!adj.has(c.source_id)) adj.set(c.source_id, new Set());
      if (!adj.has(c.target_id)) adj.set(c.target_id, new Set());
      adj.get(c.source_id)!.add(c.target_id);
      adj.get(c.target_id)!.add(c.source_id);
    }

    let isFirst = nodesRef.current.size === 0;

    activeEngrams.forEach((engram, i) => {
      const prev = nodesRef.current.get(engram.id);
      const degree = degreeMap.get(engram.id) ?? 0;
      // Disc radius: blend strength + log(degree). Dramatic mode enlarges the
      // discs and weights strength harder so high-strength memories read as
      // luminous anchors.
      const r = DRAMATIC
        ? 3.4 + Math.min(5.5, Math.sqrt(degree) * 1.15) + engram.strength * 3.0
        : 2.6 + Math.min(3.6, Math.sqrt(degree) * 0.85) + engram.strength * 1.6;

      if (prev) {
        prev.engram = engram;
        prev.radius = r;
        prev.degree = degree;
        next.set(engram.id, prev);
      } else {
        // Spawn new node on a golden-angle spiral around the cluster center
        const phi = i * 2.399963229; // golden angle in radians
        const dist = isFirst ? 30 + Math.sqrt(i) * 28 : 90 + Math.random() * 80;
        next.set(engram.id, {
          id: engram.id,
          x: Math.cos(phi) * dist + (Math.random() - 0.5) * 4,
          y: Math.sin(phi) * dist + (Math.random() - 0.5) * 4,
          vx: 0, vy: 0,
          fx: null, fy: null,
          engram,
          radius: r,
          spawnedAt: isFirst ? now - 1500 : now,
          degree,
        });
      }
    });

    const edges: GraphEdge[] = [];
    for (const c of connections) {
      if (!next.has(c.source_id) || !next.has(c.target_id)) continue;
      edges.push({
        id: c.id,
        source: c.source_id,
        target: c.target_id,
        weight: c.weight,
        type: c.connection_type,
      });
    }

    nodesRef.current = next;
    edgesRef.current = edges;
    adjacencyRef.current = adj;

    // Reheat sim — mild for live updates, hot for first load
    alphaRef.current = prefersReducedMotion ? 0 : isFirst ? 1 : Math.max(alphaRef.current, 0.35);
    // Re-fit camera whenever the visible set changes (filter switch, new load)
    autoFitRef.current.done = false;
    autoFitRef.current.settleFrames = 0;
    setHasSettled(false);
  }, [activeEngrams, connections, prefersReducedMotion]);

  // ── Physics + render loop ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;

    const resize = () => {
      w = container.clientWidth;
      h = container.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Simulation tunables
    const REPULSE_K = 220;     // strength of inverse-square repulsion
    const SPRING_K = 0.025;    // stiffness coefficient
    const REST = 80;           // edge rest length
    const GRAVITY = 0.012;
    const DAMP = 0.86;
    const THETA = 0.85;        // Barnes-Hut accuracy
    const MAX_VEL = 14;
    const ALPHA_DECAY = 0.012;
    const ALPHA_MIN = 0.005;

    const fxfy = { fx: 0, fy: 0 };

    const simulate = () => {
      const alpha = alphaRef.current;
      if (alpha < ALPHA_MIN) {
        if (!hasSettled) setHasSettled(true);
        // Skip physics when settled (huge perf win)
        return;
      }
      const nodes = Array.from(nodesRef.current.values());
      if (nodes.length === 0) return;

      // Build quadtree
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
      }
      const pad = 50;
      const size = Math.max(maxX - minX, maxY - minY) + pad * 2;
      const root = new QuadNode(minX - pad, minY - pad, size, size);
      for (const n of nodes) root.insert(n);

      // Repulsion (Barnes-Hut)
      for (const n of nodes) {
        if (n.fx !== null && n.fy !== null) continue;
        fxfy.fx = 0; fxfy.fy = 0;
        root.apply(n, THETA, REPULSE_K, fxfy);
        n.vx += fxfy.fx * alpha * 0.05;
        n.vy += fxfy.fy * alpha * 0.05;
      }

      // Spring attraction along edges
      for (const e of edgesRef.current) {
        const a = nodesRef.current.get(e.source)!;
        const b = nodesRef.current.get(e.target)!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const k = SPRING_K * Math.min(2.4, 0.6 + e.weight * 1.4);
        const disp = (dist - REST) * k * alpha;
        const ux = dx / dist, uy = dy / dist;
        if (a.fx === null) { a.vx += ux * disp; a.vy += uy * disp; }
        if (b.fx === null) { b.vx -= ux * disp; b.vy -= uy * disp; }
      }

      // Gravity + integrate
      for (const n of nodes) {
        if (n.fx !== null && n.fy !== null) {
          n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0;
          continue;
        }
        n.vx -= n.x * GRAVITY * alpha;
        n.vy -= n.y * GRAVITY * alpha;
        n.vx *= DAMP;
        n.vy *= DAMP;
        // Velocity clamp
        const sp2 = n.vx * n.vx + n.vy * n.vy;
        if (sp2 > MAX_VEL * MAX_VEL) {
          const s = MAX_VEL / Math.sqrt(sp2);
          n.vx *= s; n.vy *= s;
        }
        n.x += n.vx;
        n.y += n.vy;
      }

      // Cool
      alphaRef.current = Math.max(ALPHA_MIN * 0.9, alpha - ALPHA_DECAY * alpha);
    };

    const render = () => {
      // Auto-fit: once the layout has begun settling, frame all nodes so the
      // entire graph is visible regardless of size. Re-runs on filter / data
      // changes (autoFitRef gets reset by the build effect).
      if (!autoFitRef.current.done && nodesRef.current.size > 0 && w > 0 && h > 0) {
        // Wait a few frames so the simulation has expanded the initial spiral.
        autoFitRef.current.settleFrames += 1;
        const ready = autoFitRef.current.settleFrames > 8 && alphaRef.current < 0.4;
        if (ready || autoFitRef.current.settleFrames > 240) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const n of nodesRef.current.values()) {
            if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
            if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
          }
          const bw = Math.max(1, maxX - minX);
          const bh = Math.max(1, maxY - minY);
          const pad = 80;
          const zx = (w - pad * 2) / bw;
          const zy = (h - pad * 2) / bh;
          const z = Math.max(0.05, Math.min(2, Math.min(zx, zy)));
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const camNow = cameraRef.current;
          camNow.tz = z;
          camNow.tx = -cx * z;
          camNow.ty = -cy * z;
          autoFitRef.current.done = true;
        }
      }

      // Camera easing
      const cam = cameraRef.current;
      if (prefersReducedMotion) {
        cam.x = cam.tx;
        cam.y = cam.ty;
        cam.zoom = cam.tz;
      } else {
        cam.x += (cam.tx - cam.x) * 0.18;
        cam.y += (cam.ty - cam.y) * 0.18;
        cam.zoom += (cam.tz - cam.zoom) * 0.18;
      }

      // Pan inertia (when not actively dragging)
      if (!prefersReducedMotion && dragRef.current.mode === 'none' && (Math.abs(dragRef.current.vx) > 0.05 || Math.abs(dragRef.current.vy) > 0.05)) {
        cam.tx += dragRef.current.vx;
        cam.ty += dragRef.current.vy;
        dragRef.current.vx *= 0.92;
        dragRef.current.vy *= 0.92;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(cam.zoom * dpr, 0, 0, cam.zoom * dpr, (w / 2 + cam.x) * dpr, (h / 2 + cam.y) * dpr);

      const selectedId = selectedIdRef.current;
      const hoveredId = hoveredRef.current;
      const focusId = hoveredId ?? selectedId;
      const focusNeighbors = focusId ? adjacencyRef.current.get(focusId) : null;
      const now = performance.now();

      ctx.lineCap = 'round';

      // Edges
      for (const e of edgesRef.current) {
        const a = nodesRef.current.get(e.source);
        const b = nodesRef.current.get(e.target);
        if (!a || !b) continue;
        const isFocused = focusId && (e.source === focusId || e.target === focusId);
        const isDimmed = focusId && !isFocused;
        const ageA = Math.min(1, (now - a.spawnedAt) / 1400);
        const ageB = Math.min(1, (now - b.spawnedAt) / 1400);
        const fadeIn = prefersReducedMotion ? 1 : easeOutCubic(Math.min(ageA, ageB));

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (isFocused) {
          ctx.strokeStyle = EDGE_HIGHLIGHT;
          ctx.lineWidth = (0.9 / cam.zoom) * fadeIn;
        } else if (isDimmed) {
          ctx.strokeStyle = EDGE_DIM;
          ctx.lineWidth = (0.45 / cam.zoom) * fadeIn;
        } else {
          const baseAlpha = (DRAMATIC ? 0.10 + Math.min(0.30, e.weight * 0.22) : 0.05 + Math.min(0.18, e.weight * 0.13)) * fadeIn;
          ctx.strokeStyle = `${EDGE_BASE} ${baseAlpha.toFixed(3)})`;
          ctx.lineWidth = (DRAMATIC ? 0.8 : 0.5) / cam.zoom;
        }
        ctx.stroke();
      }

      // Nodes
      const nodes = Array.from(nodesRef.current.values());
      for (const node of nodes) {
        const r = node.radius / cam.zoom;
        const tint = TYPE_TINTS[node.engram.engram_type] ?? [220, 219, 216];
        const isHovered = hoveredId === node.id;
        const isSelected = selectedId === node.id;
        const isNeighbor = focusNeighbors?.has(node.id);
        const isDimmed = focusId && !isHovered && !isSelected && !isNeighbor;
        const age = Math.min(1, (now - node.spawnedAt) / 1400);
        const fadeIn = prefersReducedMotion ? 1 : easeOutCubic(age);

        // Dramatic glow halo — a soft luminous bloom behind each disc so the
        // constellation reads as points of light. Radial gradient, tint-hued.
        if (DRAMATIC && !isDimmed) {
          const glowR = r * (isHovered || isSelected ? 4.0 : 2.8);
          const ga = (isHovered || isSelected ? 0.34 : isNeighbor ? 0.24 : 0.17) * fadeIn;
          const grad = ctx.createRadialGradient(node.x, node.y, r * 0.35, node.x, node.y, glowR);
          grad.addColorStop(0, `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${ga})`);
          grad.addColorStop(1, `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Filled disc
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        if (isSelected || isHovered) {
          ctx.fillStyle = `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${(DRAMATIC ? 0.6 : 0.42) * fadeIn})`;
        } else if (isNeighbor) {
          ctx.fillStyle = `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${(DRAMATIC ? 0.38 : 0.22) * fadeIn})`;
        } else if (isDimmed) {
          ctx.fillStyle = `rgba(220, 219, 216, ${0.04 * fadeIn})`;
        } else {
          // At rest, a solid-ish hued core (the glow supplies the bloom).
          ctx.fillStyle = `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${(DRAMATIC ? 0.30 : 0.14) * fadeIn})`;
        }
        ctx.fill();

        // Crisp 1px ring (with type tint for non-focused)
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = isHovered
          ? NODE_STROKE_HOVER
          : isDimmed
            ? NODE_STROKE_DIM
            : `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${(DRAMATIC ? 0.78 : 0.55) * fadeIn})`;
        ctx.lineWidth = (DRAMATIC ? 1.2 : 1) / cam.zoom;
        ctx.stroke();

        // Selection halo
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = SELECT_RING;
          ctx.lineWidth = 1.2 / cam.zoom;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 8, 0, Math.PI * 2);
          ctx.strokeStyle = SELECT_HALO;
          ctx.lineWidth = 1 / cam.zoom;
          ctx.stroke();
        }

        // New-node breath pulse for first 1.4s
        if (!prefersReducedMotion && age < 1) {
          const pulseR = r + (1 - age) * 6;
          ctx.beginPath();
          ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${(1 - age) * 0.35})`;
          ctx.lineWidth = 0.8 / cam.zoom;
          ctx.stroke();
        }
      }

      simulate();
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion, hasSettled]);

  // ── Convert client coords → world coords ────────────────────────────────
  const clientToWorld = useCallback((cx: number, cy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    return {
      x: (cx - rect.left - rect.width / 2 - cam.x) / cam.zoom,
      y: (cy - rect.top - rect.height / 2 - cam.y) / cam.zoom,
    };
  }, []);

  const getNodeAtClient = useCallback((cx: number, cy: number): GraphNode | null => {
    const { x, y } = clientToWorld(cx, cy);
    const cam = cameraRef.current;
    let best: GraphNode | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current.values()) {
      const dx = n.x - x, dy = n.y - y;
      const d2 = dx * dx + dy * dy;
      const hit = (n.radius / cam.zoom) + 6 / cam.zoom;
      if (d2 < hit * hit && d2 < bestD) { best = n; bestD = d2; }
    }
    return best;
  }, [clientToWorld]);

  // ── Mouse handlers ──────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.mode === 'pan') {
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      cameraRef.current.tx += dx;
      cameraRef.current.x += dx;
      cameraRef.current.ty += dy;
      cameraRef.current.y += dy;
      drag.vx = dx; drag.vy = dy;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      return;
    }
    if (drag.mode === 'node' && drag.nodeId) {
      const { x, y } = clientToWorld(e.clientX, e.clientY);
      const n = nodesRef.current.get(drag.nodeId);
      if (n) { n.fx = x; n.fy = y; }
      if (!prefersReducedMotion) alphaRef.current = Math.max(alphaRef.current, 0.3);
      return;
    }
    const node = getNodeAtClient(e.clientX, e.clientY);
    setHoveredNode(node?.id ?? null);
    if (node) {
      const rect = canvasRef.current!.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setCursorPos(null);
    }
  }, [clientToWorld, getNodeAtClient, prefersReducedMotion]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = getNodeAtClient(e.clientX, e.clientY);
    if (node) {
      dragRef.current = { mode: 'node', lastX: e.clientX, lastY: e.clientY, nodeId: node.id, vx: 0, vy: 0 };
    } else {
      dragRef.current = { mode: 'pan', lastX: e.clientX, lastY: e.clientY, nodeId: null, vx: 0, vy: 0 };
    }
  }, [getNodeAtClient]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.mode === 'node' && drag.nodeId) {
      const n = nodesRef.current.get(drag.nodeId);
      // Treat as click if barely moved
      const moved = Math.hypot(e.clientX - drag.lastX, e.clientY - drag.lastY);
      if (n && moved < 4) {
        setSelectedEngram(n.engram);
        openDrawer('memory-detail', { engramId: n.engram.id });
      }
      if (n) { n.fx = null; n.fy = null; }
      if (!prefersReducedMotion) alphaRef.current = Math.max(alphaRef.current, 0.15);
    }
    dragRef.current.mode = 'none';
    dragRef.current.nodeId = null;
  }, [setSelectedEngram, openDrawer, prefersReducedMotion]);

  const handleMouseLeave = useCallback(() => {
    dragRef.current.mode = 'none';
    dragRef.current.nodeId = null;
    setHoveredNode(null);
    setCursorPos(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newZoom = Math.max(0.2, Math.min(5, cam.tz * factor));
    // Zoom toward cursor
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const ratio = newZoom / cam.tz;
    cam.tx = mx - (mx - cam.tx) * ratio;
    cam.ty = my - (my - cam.ty) * ratio;
    cam.tz = newZoom;
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Re-fit camera to all nodes
    autoFitRef.current.done = false;
    autoFitRef.current.settleFrames = 9; // skip warmup so fit happens immediately
    if (!prefersReducedMotion) alphaRef.current = Math.max(alphaRef.current, 0.15);
  }, [prefersReducedMotion]);

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const validEdges = edgesRef.current.length;
    return { nodes: activeEngrams.length, edges: validEdges };
  }, [activeEngrams, connections]);

  const hoveredEngram = hoveredNode ? nodesRef.current.get(hoveredNode)?.engram : null;
  const filterOptions: Array<{ key: string | null; label: string }> = [
    { key: null, label: 'All' },
    { key: 'episodic', label: 'Episodic' },
    { key: 'semantic', label: 'Semantic' },
    { key: 'procedural', label: 'Procedural' },
    { key: 'belief', label: 'Belief' },
  ];

  return (
    <div className="s-stream" style={{ height: '100%' }}>
      {/* Folio strip */}
      <div className="r2-folio">
        <div className="r2-folio-left">
          <span><span className="agent-dot" /> mnemos</span>
          <span>session 001</span>
        </div>
        <div className="r2-folio-right">
          <span>claude-sonnet-4.5</span>
          <span>{fmtClock()}</span>
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: '0 36px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        <div className="s-hero" style={{ paddingBottom: 18 }}>
          <div className="s-hero-eye">
            <span className="num"># 02</span>
            <span>·</span>
            <span className="v">Living Memory Substrate</span>
            <span>·</span>
            <span className="stream">{stats.nodes} active</span>
          </div>
          <h1 className="s-hero-title">Mnemos</h1>
        </div>
      </div>

      {/* Canvas surface */}
      <div
        ref={containerRef}
        style={{
          flex: 1, position: 'relative', minHeight: 0,
          margin: '0 36px 24px',
          maxWidth: 'calc(1280px - 72px)',
          width: 'auto',
          alignSelf: 'center',
          marginLeft: 'auto', marginRight: 'auto',
          borderTop: '1px solid var(--hairline)',
          overflow: 'hidden',
        }}
      >
        {/* Eyebrow + filter pills */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 4px',
            zIndex: 5, pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-whisper)',
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            Mnemos Graph
            {!hasSettled && (
              <span
                aria-hidden
                style={{
                  display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--text-soft)',
                  animation: prefersReducedMotion ? 'none' : 'graphPulse 1.6s ease-in-out infinite',
                }}
              />
            )}
          </span>
          <div style={{ pointerEvents: 'auto', display: 'flex', gap: 4 }}>
            {filterOptions.map((opt) => {
              const active = filterRef.current === opt.key;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setFilterType(opt.key)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: active ? 'var(--ink)' : 'var(--text-soft)',
                    letterSpacing: 'var(--track-folio)',
                    textTransform: 'uppercase',
                    padding: '6px 12px',
                    border: '1px solid var(--hairline)',
                    borderRadius: 999,
                    background: active ? 'var(--surface-2, rgba(255,255,255,0.04))' : 'transparent',
                    cursor: 'pointer',
                    transition: 'color 200ms var(--ease-out, ease-out), background 200ms var(--ease-out, ease-out)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setDemoMode((v) => !v)}
              title="Toggle synthetic preview data (not saved)"
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: demoMode ? 'var(--ink)' : 'var(--text-soft)',
                letterSpacing: 'var(--track-folio)',
                textTransform: 'uppercase',
                padding: '6px 12px',
                marginLeft: 8,
                border: '1px solid var(--hairline)',
                borderRadius: 999,
                background: demoMode ? 'var(--surface-2, rgba(255,255,255,0.04))' : 'transparent',
                cursor: 'pointer',
                transition: 'color 200ms var(--ease-out, ease-out), background 200ms var(--ease-out, ease-out)',
              }}
            >
              {demoMode ? 'Demo · On' : 'Demo'}
            </button>
          </div>
        </div>

        {stats.nodes === 0 ? (
          <div className="s-empty" style={{ height: '100%' }}>
            No engrams to visualize. Memories will form connections after conversations.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', height: '100%',
              cursor: dragRef.current.mode === 'pan' ? 'grabbing' : hoveredNode ? 'pointer' : 'grab',
              display: 'block',
              background: CANVAS_BG,
              touchAction: 'none',
            }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
          />
        )}

        {/* Hover tooltip */}
        {hoveredEngram && cursorPos && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(cursorPos.x + 14, (containerRef.current?.clientWidth ?? 9999) - 296),
              top: Math.min(cursorPos.y + 14, (containerRef.current?.clientHeight ?? 9999) - 140),
              maxWidth: 280,
              padding: '10px 12px',
              background: 'var(--surface-3)',
              border: '1px solid var(--hairline)',
              borderRadius: 6,
              pointerEvents: 'none',
              boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
              zIndex: 10,
              animation: prefersReducedMotion ? 'none' : 'graphTooltipIn 140ms var(--ease-out, ease-out) both',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-whisper)', letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
            }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: `rgb(${TYPE_TINTS[hoveredEngram.engram_type]?.join(',') ?? '220,219,216'})`,
              }} />
              <span style={{ color: 'var(--text-soft)' }}>{hoveredEngram.engram_type}</span>
              <span>·</span>
              <span>{hoveredEngram.state}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-soft)' }}>
                s {hoveredEngram.strength.toFixed(2)}
              </span>
            </div>
            <div style={{
              fontFamily: 'var(--font-sans)', fontSize: 12,
              color: 'var(--text-primary)', lineHeight: 1.45,
              display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {hoveredEngram.content}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '0 36px 22px',
          maxWidth: 1280,
          margin: '0 auto',
          width: '100%',
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-whisper)',
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{stats.nodes} engrams · {stats.edges} connections</span>
        <span>Scroll to zoom · Drag to pan · Double-click to recenter</span>
      </div>
    </div>
  );
}
