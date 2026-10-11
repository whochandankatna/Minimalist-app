// Road graph built from highway polylines. Waypoints become nodes; nodes from
// different highways within SNAP_KM are merged so routes can change highways.
// Each place gets a local link road to its nearest node.
import type { Highway, Place } from '../data/types';
import { project, type XZ } from '../geo/projection';

const SNAP_KM = 2.0;
const DENSIFY_KM = 2.5;

export interface RoadNode extends XZ { id: number; edges: number[] }
export interface RoadEdge { id: number; a: number; b: number; len: number; speedKmh: number; highwayId: string; toll?: { name: string } }
export interface Route { points: XZ[]; cum: number[]; km: number; hours: number; tolls: string[]; highways: string[] }

export class RoadNetwork {
  nodes: RoadNode[] = [];
  edges: RoadEdge[] = [];
  placeNode = new Map<string, number>();
  private cache = new Map<string, Route>();

  constructor(highways: Highway[], places: Place[]) {
    for (const h of highways) this.addPolyline(h);
    for (const h of highways) for (const t of h.tollPlazas ?? []) this.attachToll(t.name, project(t.lat, t.lon));
    for (const p of places) this.linkPlace(p);
  }

  private nodeAt(pt: XZ): number {
    let best = -1, bd = SNAP_KM;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - pt.x, n.z - pt.z);
      if (d < bd) { bd = d; best = n.id; }
    }
    if (best >= 0) return best;
    const id = this.nodes.length;
    this.nodes.push({ id, x: pt.x, z: pt.z, edges: [] });
    return id;
  }

  private addEdge(a: number, b: number, speedKmh: number, highwayId: string) {
    if (a === b) return;
    const A = this.nodes[a], B = this.nodes[b];
    const id = this.edges.length;
    this.edges.push({ id, a, b, len: Math.hypot(A.x - B.x, A.z - B.z) * 1.08, speedKmh, highwayId });
    A.edges.push(id); B.edges.push(id);
  }

  private addPolyline(h: Highway) {
    // Effective loaded-truck speeds on Punjab roads including towns and traffic.
    const speed = (h.lanes ?? 2) >= 6 ? 50 : (h.lanes ?? 2) >= 4 ? 42 : 32;
    const pts = h.waypoints.map(([lat, lon]) => project(lat, lon));
    let prev = this.nodeAt(pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const segs = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / DENSIFY_KM));
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const n = this.nodeAt({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        this.addEdge(prev, n, speed, h.id);
        prev = n;
      }
    }
  }

  private attachToll(name: string, pt: XZ) {
    let best: RoadEdge | null = null, bd = 3;
    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const d = Math.min(Math.hypot(A.x - pt.x, A.z - pt.z), Math.hypot(B.x - pt.x, B.z - pt.z));
      if (d < bd) { bd = d; best = e; }
    }
    if (best && !best.toll) best.toll = { name };
  }

  private linkPlace(p: Place) {
    const pt = project(p.lat, p.lon);
    let best = -1, bd = Infinity;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - pt.x, n.z - pt.z);
      if (d < bd) { bd = d; best = n.id; }
    }
    if (best < 0) return;
    if (bd < 0.3) { this.placeNode.set(p.id, best); return; }
    const id = this.nodes.length;
    this.nodes.push({ id, x: pt.x, z: pt.z, edges: [] });
    this.addEdge(id, best, 25, 'local');
    this.placeNode.set(p.id, id);
  }

  route(fromPlace: string, toPlace: string): Route | null {
    const key = `${fromPlace}>${toPlace}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const s = this.placeNode.get(fromPlace), t = this.placeNode.get(toPlace);
    if (s == null || t == null) return null;
    const r = this.shortest(s, t);
    if (r) this.cache.set(key, r);
    return r;
  }

  private shortest(s: number, t: number): Route | null {
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prevEdge = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[s] = 0;
    // Graph is small (hundreds of nodes); an O(n^2) Dijkstra is fine.
    for (;;) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === t) break;
      done[u] = 1;
      for (const eid of this.nodes[u].edges) {
        const e = this.edges[eid];
        const v = e.a === u ? e.b : e.a;
        const w = e.len / e.speedKmh;
        if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prevEdge[v] = eid; }
      }
    }
    if (!Number.isFinite(dist[t])) return null;
    const nodeSeq: number[] = [t];
    const tolls: string[] = [], hw = new Set<string>();
    let km = 0;
    for (let v = t; v !== s;) {
      const e = this.edges[prevEdge[v]];
      km += e.len;
      if (e.toll) tolls.push(e.toll.name);
      if (e.highwayId !== 'local') hw.add(e.highwayId);
      v = e.a === v ? e.b : e.a;
      nodeSeq.push(v);
    }
    nodeSeq.reverse();
    const points = nodeSeq.map(i => ({ x: this.nodes[i].x, z: this.nodes[i].z }));
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    return { points, cum, km, hours: dist[t], tolls: [...new Set(tolls)], highways: [...hw] };
  }
}

/** Position and heading at distance d along a route polyline. */
export function along(r: Route, d: number): { x: number; z: number; heading: number } {
  const total = r.cum[r.cum.length - 1];
  const dd = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i] < dd) i++;
  const a = r.points[i - 1], b = r.points[i] ?? a;
  const seg = r.cum[i] - r.cum[i - 1] || 1;
  const t = (dd - r.cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}
