// Three.js view of the simulated corridor. Static geography is built once;
// dynamic layers (trucks, trains, agents, money flows, fires) sync every frame.
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { project, type XZ } from '../geo/projection';
import { along } from '../sim/roads';
import type { Archetype } from '../sim/model';
import type { World } from '../sim/world';
import { createGround, RIVERS, terrainHeight, type GroundUniforms } from './ground';

export type Selection =
  | { kind: 'truck'; id: number } | { kind: 'household'; id: number }
  | { kind: 'business'; id: number } | { kind: 'place'; id: string };

export const ARCH_COLORS: Record<Archetype, number> = {
  arhtiya: 0xf59f00, rice_mill: 0xfab005, flour_mill: 0xe8b04a, input_dealer: 0x74b816, retail_grocery: 0x40c057,
  retail_cloth: 0xe64980, retail_electronics: 0x4c6ef5, jeweller: 0xffd43b, education: 0x15aabf, immigration: 0x7950f2,
  health: 0xfa5252, fuel: 0x495057, transporter: 0xfd7e14, food_service: 0xff922b, auto_dealer: 0x868e96,
  it_services: 0x228be6, real_estate: 0xa47148, events: 0xf783ac, finance: 0x0ca678, dairy: 0xe9ecef,
  hospitality: 0xcc5de8, manufacturing: 0x5c7cfa, wholesale: 0x20c997, ecommerce: 0x339af0, cold_store: 0x99e9f2,
  repair: 0x8d6e63, other: 0xadb5bd,
};

export const FLOW_COLORS: Record<string, number> = {
  consumption: 0x51cf66, crop_sale: 0xffd43b, procurement: 0xfcc419, milk_sale: 0xf8f9fa, freight: 0xff922b,
  wages: 0x74c0fc, salary: 0x4dabf7, remittance: 0xda77f2, loan: 0xff6b6b, repayment: 0xffa8a8, wedding: 0xf783ac,
  commission: 0xf59f00, external_sales: 0x63e6be, export: 0x63e6be, restock: 0x91a7ff, profit_draw: 0x8ce99a,
};

const COMMODITY_COLORS: Record<string, number> = {
  wheat: 0xd4a017, paddy: 0xe9d38a, rice: 0xf8f9fa, milk: 0xdee2e6, fmcg: 0xe03131, goods: 0x1c7ed6,
  fertilizer: 0xf1f3f5, other: 0x868e96, basmati: 0xf3e5ab, maize: 0xfcc419, potato: 0xa0522d,
};

const MAX_HH = 20000;
const CONVOY = 3;

export class SimRenderer {
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: MapControls;
  ground: { mesh: THREE.Mesh; uniforms: GroundUniforms };
  sun = new THREE.DirectionalLight(0xffffff, 2.2);
  hemi = new THREE.HemisphereLight(0xdbeafe, 0x6b5a3a, 1.1);
  fog = new THREE.FogExp2(0xb8c6d1, 0.002);
  lineMats: LineMaterial[] = [];
  overlayLines: Line2[] = [];
  buildingMat!: THREE.MeshStandardMaterial;
  labels: { obj: CSS2DObject; importance: number; x: number; z: number }[] = [];
  layers = { households: true, businesses: true, flows: true, labels: true, trucks: true };
  selection: Selection | null = null;
  private trucksCab!: THREE.InstancedMesh; private trucksCargo!: THREE.InstancedMesh;
  private hhMesh!: THREE.InstancedMesh; private bizMesh!: THREE.InstancedMesh;
  private trainMesh!: THREE.InstancedMesh;
  private heaps = new Map<string, { mesh: THREE.InstancedMesh; x: number; z: number }>();
  private flowLines!: THREE.LineSegments; private flowHeads!: THREE.Points;
  private fire!: THREE.Points; private smoke!: THREE.Points;
  private selRing!: THREE.Mesh;
  private hhCount = -1;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private world: World;
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private fly: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null = null;
  profileColors = new Map<string, number>();

  constructor(container: HTMLElement, world: World) {
    this.world = world;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.003, 4000);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 420;
    this.controls.zoomSpeed = 1.4;
    const moga = world.place('moga')!, chd = world.place('chandigarh')!;
    const mid = { x: (moga.x + chd.x) / 2, z: (moga.z + chd.z) / 2 };
    this.camera.position.set(mid.x - 10, 120, mid.z + 95);
    this.controls.target.set(mid.x, 0, mid.z);

    this.scene.fog = this.fog;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    const xs = [...world.places.values()].map(p => p.x), zs = [...world.places.values()].map(p => p.z);
    this.bounds = { minX: Math.min(...xs) - 40, maxX: Math.max(...xs) + 40, minZ: Math.min(...zs) - 35, maxZ: Math.max(...zs) + 35 };
    this.ground = createGround(this.bounds);
    this.scene.add(this.ground.mesh);

    this.buildWater();
    this.buildRoads();
    this.buildSettlements();
    this.buildFacilities();
    this.buildDynamic();
    this.buildLabels();
    const palette = [0xf08c00, 0xe8590c, 0xd9480f, 0xffd43b, 0x82c91e, 0x37b24d, 0x12b886, 0x1098ad, 0x1c7ed6, 0x4263eb, 0x7048e8, 0xae3ec9, 0xd6336c, 0xf76707, 0x74b816, 0x3bc9db, 0x748ffc, 0xda77f2];
    world.data.psychographics.profiles.forEach((p, i) => this.profileColors.set(p.id, palette[i % palette.length]));
    window.addEventListener('resize', () => this.resize(container));
  }

  resize(container: HTMLElement) {
    const w = container.clientWidth, h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    for (const m of this.lineMats) m.resolution.set(w, h);
  }

  // ------------------------------------------------------------------ helpers
  private ribbon(pts: XZ[], width: number, color: number, y = 0.006, opacity = 1): THREE.Mesh {
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l * width / 2, nz = dx / l * width / 2;
      const yy = terrainHeight(pts[i].x, pts[i].z) + y;
      pos.push(pts[i].x + nx, yy, pts[i].z + nz, pts[i].x - nx, yy, pts[i].z - nz);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, polygonOffset: true, polygonOffsetFactor: -2 }));
    return m;
  }

  private overlay(pts: XZ[], color: number, px: number, y = 0.03, dashed = false): Line2 {
    const flat: number[] = [];
    for (const p of pts) flat.push(p.x, terrainHeight(p.x, p.z) + y, p.z);
    const g = new LineGeometry();
    g.setPositions(flat);
    const m = new LineMaterial({ color, linewidth: px, transparent: true, opacity: 0.9, dashed, dashSize: 0.6, gapSize: 0.4, worldUnits: false });
    m.resolution.set(window.innerWidth, window.innerHeight);
    this.lineMats.push(m);
    const l = new Line2(g, m);
    if (dashed) l.computeLineDistances();
    return l;
  }

  private densify(pts: XZ[], step = 0.4): XZ[] {
    const out: XZ[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
      for (let k = 1; k <= n; k++) {
        // Gentle meander so densified roads don't look ruler-straight.
        const t = k / n;
        const wob = k < n ? Math.sin(t * Math.PI) * Math.sin((a.x + b.z) * 3 + k) * 0.02 : 0;
        out.push({ x: a.x + (b.x - a.x) * t + wob, z: a.z + (b.z - a.z) * t - wob });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ static
  private buildWater() {
    for (const r of RIVERS) {
      const pts = this.densify(r.pts.map(([la, lo]) => project(la, lo)), 0.3);
      this.scene.add(this.ribbon(pts, r.width, 0x4f7f9a, 0.004));
      // Sandy river bed either side.
      this.scene.add(this.ribbon(pts, r.width * 3.2, 0xb9a882, 0.002));
      const l = this.overlay(pts, 0x5c9ac0, 2.2, 0.01);
      this.overlayLines.push(l); this.scene.add(l);
    }
    const sukhna = project(30.742, 76.818);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshLambertMaterial({ color: 0x4f7f9a }));
    lake.rotation.x = -Math.PI / 2; lake.scale.set(1.1, 0.55, 1); lake.position.set(sukhna.x, 0.008, sukhna.z);
    this.scene.add(lake);
  }

  private buildRoads() {
    const w = this.world;
    for (const h of w.data.geography.highways) {
      const pts = this.densify(h.waypoints.map(([la, lo]) => project(la, lo)), 0.35);
      const lanes = h.lanes ?? 2;
      this.scene.add(this.ribbon(pts, lanes >= 6 ? 0.05 : lanes >= 4 ? 0.036 : 0.018, 0x3b3d40, 0.012));
      if (lanes >= 4) this.scene.add(this.ribbon(pts, 0.004, 0xd8d1a8, 0.0135)); // median
      const l = this.overlay(pts, lanes >= 4 ? 0xffb347 : 0xffe08a, lanes >= 6 ? 3.4 : lanes >= 4 ? 2.8 : 2, 0.05);
      this.overlayLines.push(l); this.scene.add(l);
      // Roadside eucalyptus rows typical of Punjab highways.
      this.treesAlong(pts, 0.05);
      for (const t of h.tollPlazas ?? []) {
        const p = project(t.lat, t.lon);
        const booth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.02), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }));
        booth.position.set(p.x, 0.012, p.z);
        this.scene.add(booth);
        this.addLabel(`Toll: ${t.name}`, p.x, p.z, 0.4, 'lbl-toll', 2);
      }
      const midPt = pts[Math.floor(pts.length / 2)];
      this.addLabel(h.id.toUpperCase().replace(/_.*/, '').replace(/^NH/, 'NH-'), midPt.x, midPt.z, 0.1, 'lbl-road', 1);
    }
    for (const r of w.data.geography.railways ?? []) {
      const pts = this.densify(r.waypoints.map(([la, lo]) => project(la, lo)), 0.5);
      this.scene.add(this.ribbon(pts, 0.012, 0x5a4636, 0.01));
      const l = this.overlay(pts, 0x8c6d9e, 1.6, 0.04, true);
      this.overlayLines.push(l); this.scene.add(l);
    }
  }

  private trees: { x: number; z: number; s: number; c: number }[] = [];
  private treesAlong(pts: XZ[], offset: number) {
    for (let i = 0; i < pts.length; i += 1) {
      if (Math.random() > 0.55) continue;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      for (const side of [-1, 1]) {
        this.trees.push({ x: pts[i].x - dz / l * offset * side, z: pts[i].z + dx / l * offset * side, s: 0.012 + Math.random() * 0.01, c: 0x3d6b35 });
      }
    }
  }

  private buildSettlements() {
    const w = this.world;
    const boxes: { x: number; z: number; sx: number; sz: number; h: number; rot: number; c: number }[] = [];
    const urban: THREE.Vector3[] = [];
    const brick = [0xc9a27e, 0xd9c2a3, 0xe8dcc6, 0xbf8f6a, 0xd8b4a0, 0xf1e3c6, 0xcfd8dc];
    const concrete = [0xbdb7ab, 0xa89f91, 0xc4a484, 0xd6d0c4, 0x9e8f7d, 0xe0dbd1];
    for (const p of w.places.values()) {
      if (p.type !== 'city' && p.type !== 'town') continue;
      const pop = p.population ?? 0;
      if (pop <= 0) continue;
      const R = p.radius;
      urban.push(new THREE.Vector3(p.x, p.z, R * 1.05));
      const grid = /chandigarh|mohali|panchkula/i.test(p.id);
      const n = Math.round(Math.min(p.type === 'city' ? 2800 : 600, Math.max(30, pop / (grid ? 420 : 520))));
      const theta = grid ? -0.68 : 0;
      for (let i = 0; i < n; i++) {
        const r = R * Math.pow(Math.random(), 0.75);
        const a = Math.random() * Math.PI * 2;
        let x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        let rot = Math.random() * Math.PI;
        if (grid) {
          // Le Corbusier sectors: 1.2 × 0.8 km blocks separated by V-2 roads and green belts.
          const lx = (x - p.x) * Math.cos(theta) - (z - p.z) * Math.sin(theta);
          const lz = (x - p.x) * Math.sin(theta) + (z - p.z) * Math.cos(theta);
          const fx = ((lx % 1.2) + 1.2) % 1.2, fz = ((lz % 0.8) + 0.8) % 0.8;
          if (fx < 0.09 || fz < 0.07 || (fx > 0.55 && fx < 0.65)) { if (Math.random() < 0.8) { this.trees.push({ x, z, s: 0.012 + Math.random() * 0.012, c: 0x2f5d2b }); continue; } }
          rot = -theta;
        }
        const centre = 1 - r / R;
        const floors = grid ? 1 + Math.floor(Math.random() * 3 + (Math.random() < 0.04 ? 4 : 0)) : 1 + Math.floor(Math.random() * 2 + centre * 2.5);
        const fp = grid ? 0.02 + Math.random() * 0.025 : 0.012 + Math.random() * 0.02 + centre * 0.01;
        boxes.push({ x, z, sx: fp, sz: fp * (0.7 + Math.random() * 0.8), h: floors * 0.0035 * 2.2, rot, c: grid ? concrete[i % concrete.length] : brick[i % brick.length] });
      }
      if (grid) for (let i = 0; i < n * 0.5; i++) {
        const r = R * Math.sqrt(Math.random()), a = Math.random() * 6.283;
        this.trees.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, s: 0.012 + Math.random() * 0.014, c: 0x2b5a28 });
      }
    }
    // Villages: clustered houses, a gurdwara with Nishan Sahib, groves; deras scattered in fields.
    const gurdwaras: XZ[] = [];
    for (const p of w.places.values()) {
      if (p.type !== 'village_cluster') continue;
      urban.push(new THREE.Vector3(p.x, p.z, 0.55));
      const n = 70 + Math.floor(Math.random() * 60);
      for (let i = 0; i < n; i++) {
        const r = 0.5 * Math.pow(Math.random(), 0.7), a = Math.random() * 6.283;
        boxes.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, sx: 0.012 + Math.random() * 0.01, sz: 0.012 + Math.random() * 0.01, h: 0.0035 * (1 + Math.floor(Math.random() * 2)) * 2.2, rot: Math.random() * 3, c: brick[i % brick.length] });
      }
      for (let i = 0; i < 40; i++) {
        const r = 0.4 + Math.random() * 0.5, a = Math.random() * 6.283;
        this.trees.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, s: 0.012 + Math.random() * 0.01, c: 0x3f6d33 });
      }
      gurdwaras.push({ x: p.x + 0.08, z: p.z - 0.05 });
    }
    const moga = w.place('moga')!;
    for (let i = 0; i < 1400; i++) {
      const r = 3 + Math.random() * 24, a = Math.random() * 6.283;
      const x = moga.x + Math.cos(a) * r, z = moga.z + Math.sin(a) * r;
      boxes.push({ x, z, sx: 0.016, sz: 0.012, h: 0.0035 * 2.2, rot: Math.random() * 3, c: 0xe9dcc3 });
      if (Math.random() < 0.6) this.trees.push({ x: x + 0.02, z: z + 0.015, s: 0.014, c: 0x456f37 });
    }
    this.ground.uniforms.uUrban.value.splice(0, urban.length, ...urban.slice(0, 64));
    this.ground.uniforms.uUrbanN.value = Math.min(64, urban.length);

    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    this.buildingMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, emissive: 0xffc070, emissiveIntensity: 0 });
    const mesh = new THREE.InstancedMesh(geo, this.buildingMat, boxes.length);
    boxes.forEach((b, i) => {
      this.dummy.position.set(b.x, terrainHeight(b.x, b.z), b.z);
      this.dummy.rotation.set(0, b.rot, 0);
      this.dummy.scale.set(b.sx, b.h, b.sz);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      mesh.setColorAt(i, this.color.setHex(b.c));
    });
    this.scene.add(mesh);

    // Gurdwaras: white hall, gold dome, saffron flag pole.
    const gw = gurdwaras.length;
    const hall = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.014, 0.04).translate(0, 0.007, 0), new THREE.MeshStandardMaterial({ color: 0xf8f9fa }), gw);
    const dome = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.014, 0), new THREE.MeshStandardMaterial({ color: 0xe0b84c, metalness: 0.6, roughness: 0.3 }), gw);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.05).translate(0.03, 0.025, 0.03), new THREE.MeshStandardMaterial({ color: 0xff8c00, emissive: 0xff6a00, emissiveIntensity: 0.3 }), gw);
    gurdwaras.forEach((g, i) => {
      this.dummy.position.set(g.x, 0, g.z); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix();
      hall.setMatrixAt(i, this.dummy.matrix); dome.setMatrixAt(i, this.dummy.matrix); pole.setMatrixAt(i, this.dummy.matrix);
    });
    this.scene.add(hall, dome, pole);
  }

  private buildFacilities() {
    const w = this.world;
    const add = (geo: THREE.BufferGeometry, color: number, x: number, z: number, opts: { rot?: number; y?: number; emissive?: number } = {}) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: opts.emissive ?? 0x000000 }));
      m.position.set(x, terrainHeight(x, z) + (opts.y ?? 0), z);
      m.rotation.y = opts.rot ?? 0;
      this.scene.add(m);
      return m;
    };
    const shed = (sx: number, sz: number, h: number) => new THREE.BoxGeometry(sx, h, sz).translate(0, h / 2, 0);
    for (const p of w.places.values()) {
      switch (p.type) {
        case 'mandi': {
          add(new THREE.BoxGeometry(0.45, 0.002, 0.32), 0xcfc8b8, p.x, p.z, { y: 0.001 });
          add(shed(0.3, 0.06, 0.012), 0x8a9aa8, p.x, p.z - 0.12);
          const heap = new THREE.InstancedMesh(new THREE.ConeGeometry(0.018, 0.012, 7).translate(0, 0.006, 0), new THREE.MeshStandardMaterial({ color: 0xe0c060, roughness: 1 }), 120);
          heap.count = 0;
          this.scene.add(heap);
          this.heaps.set(p.id, { mesh: heap, x: p.x, z: p.z });
          break;
        }
        case 'godown': {
          for (let i = 0; i < 4; i++) add(shed(0.18, 0.04, 0.014), 0x9aa5ad, p.x + (i - 1.5) * 0.06, p.z, { rot: 0 });
          if (/silo|adani/i.test(p.id + p.name)) for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 16).translate(0, 0.025, 0), 0xdee2e6, p.x + (i % 3) * 0.032, p.z + 0.08 + Math.floor(i / 3) * 0.032);
          break;
        }
        case 'plant': {
          add(shed(0.35, 0.22, 0.02), 0xeef1f4, p.x, p.z);
          add(shed(0.18, 0.12, 0.032), 0xd0d7de, p.x + 0.12, p.z + 0.05);
          add(new THREE.CylinderGeometry(0.006, 0.008, 0.08, 10).translate(0, 0.04, 0), 0xb0b7bf, p.x - 0.12, p.z + 0.08);
          for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 14).translate(0, 0.015, 0), 0xf8f9fa, p.x - 0.15 + i * 0.03, p.z - 0.14);
          break;
        }
        case 'railhead': {
          add(shed(0.3, 0.03, 0.004), 0xb0a49a, p.x, p.z);
          add(shed(0.1, 0.02, 0.01), 0xc0504d, p.x, p.z + 0.03);
          break;
        }
        case 'industrial': {
          for (let i = 0; i < 36; i++) add(shed(0.05 + Math.random() * 0.06, 0.04 + Math.random() * 0.04, 0.008 + Math.random() * 0.01), [0x7a8ea3, 0x9aa8b6, 0xb6bec7][i % 3], p.x + (i % 6 - 2.5) * 0.12, p.z + (Math.floor(i / 6) - 2.5) * 0.1);
          break;
        }
        case 'dairy': {
          add(shed(0.2, 0.12, 0.016), 0xf1f3f5, p.x, p.z);
          for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.01, 0.01, 0.035, 12).translate(0, 0.0175, 0), 0xe9ecef, p.x + 0.12, p.z - 0.04 + i * 0.03);
          break;
        }
        case 'education': {
          for (let i = 0; i < 8; i++) add(shed(0.06, 0.03, 0.012), 0xd9a27e, p.x + (i % 4) * 0.08, p.z + Math.floor(i / 4) * 0.07);
          break;
        }
        default: break;
      }
    }
    // Trees (instanced canopies).
    const tg = new THREE.IcosahedronGeometry(1, 0); tg.translate(0, 1.2, 0);
    const trunk = new THREE.CylinderGeometry(0.12, 0.15, 1.2).translate(0, 0.6, 0);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0xffffff }), this.trees.length);
    const trm = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x6b5236 }), this.trees.length);
    this.trees.forEach((t, i) => {
      this.dummy.position.set(t.x, terrainHeight(t.x, t.z), t.z); this.dummy.rotation.set(0, i, 0);
      this.dummy.scale.set(t.s * 0.45, t.s * 0.5, t.s * 0.45); this.dummy.updateMatrix();
      tm.setMatrixAt(i, this.dummy.matrix); trm.setMatrixAt(i, this.dummy.matrix);
      tm.setColorAt(i, this.color.setHex(t.c).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
    });
    this.scene.add(tm, trm);
  }

  private buildDynamic() {
    const nT = this.world.trucks.length * CONVOY;
    const cab = new THREE.BoxGeometry(0.32, 0.36, 0.3).translate(0, 0.18, 0.55);
    const cargo = new THREE.BoxGeometry(0.34, 0.4, 0.82).translate(0, 0.22, -0.05);
    this.trucksCab = new THREE.InstancedMesh(cab, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 }), nT);
    this.trucksCargo = new THREE.InstancedMesh(cargo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), nT);
    this.trucksCab.frustumCulled = false; this.trucksCargo.frustumCulled = false;
    this.scene.add(this.trucksCab, this.trucksCargo);

    this.hhMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x111111 }), MAX_HH);
    this.hhMesh.frustumCulled = false; this.hhMesh.count = 0;
    this.scene.add(this.hhMesh);

    this.bizMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x222222 }), Math.max(1, this.world.businesses.length + 200));
    this.bizMesh.frustumCulled = false;
    this.scene.add(this.bizMesh);

    this.trainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.4, 1).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ roughness: 0.7 }), 40 * 14);
    this.trainMesh.frustumCulled = false; this.trainMesh.count = 0;
    this.scene.add(this.trainMesh);

    const MAXF = 400, SEG = 18;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXF * SEG * 2 * 3), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXF * SEG * 2 * 3), 3));
    this.flowLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flowLines.frustumCulled = false;
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXF * 3), 3));
    hg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXF * 3), 3));
    this.flowHeads = new THREE.Points(hg, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture() }));
    this.flowHeads.frustumCulled = false;
    this.scene.add(this.flowLines, this.flowHeads);

    const mk = (n: number, size: number, color: number, add: boolean) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, color, transparent: true, opacity: add ? 1 : 0.5, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, map: dotTexture() }));
      p.frustumCulled = false;
      this.scene.add(p);
      return p;
    };
    this.fire = mk(3000, 6, 0xff6a1a, true);
    this.smoke = mk(6000, 14, 0x8a8178, false);

    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.visible = false; this.selRing.renderOrder = 10;
    this.scene.add(this.selRing);
  }

  private addLabel(text: string, x: number, z: number, y: number, cls: string, importance: number) {
    const div = document.createElement('div');
    div.className = `label ${cls}`;
    div.textContent = text;
    const obj = new CSS2DObject(div);
    obj.position.set(x, y, z);
    this.scene.add(obj);
    this.labels.push({ obj, importance, x, z });
  }

  private buildLabels() {
    for (const p of this.world.places.values()) {
      const imp = p.type === 'city' ? (/(moga|chandigarh)$/.test(p.id) ? 5 : (p.population ?? 0) > 300000 ? 4 : 3) : p.type === 'town' ? 3 : p.type === 'village_cluster' ? 1 : 2;
      if (p.id === 'chd_sec17') continue;
      this.addLabel(p.name, p.x, p.z, imp >= 3 ? 0.3 : 0.08, `lbl-${p.type}${imp === 5 ? ' lbl-major' : ''}`, imp);
    }
  }

  // ------------------------------------------------------------------ frame
  flyTo(x: number, z: number, dist: number) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const tTo = new THREE.Vector3(x, 0, z);
    this.fly = { from: this.camera.position.clone(), to: tTo.clone().add(dir.multiplyScalar(dist)), tFrom: this.controls.target.clone(), tTo, t: 0 };
  }

  update(dtReal: number) {
    const w = this.world;
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dtReal / 1.6);
      const e = this.fly.t < 0.5 ? 4 * this.fly.t ** 3 : 1 - (-2 * this.fly.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.fly.from, this.fly.to, e);
      this.controls.target.lerpVectors(this.fly.tFrom, this.fly.tTo, e);
      if (this.fly.t >= 1) this.fly = null;
    }
    this.controls.update();
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const s = THREE.MathUtils.clamp(camDist * 0.0042, 0.011, 0.9);

    // Time of day, season, haze.
    const hour = w.hourOfDay();
    const sunAng = ((hour - 6) / 12) * Math.PI;
    const day = THREE.MathUtils.clamp(Math.sin(sunAng) * 1.4, 0, 1);
    const night = 1 - THREE.MathUtils.smoothstep(day, 0, 0.35);
    this.sun.position.set(this.controls.target.x + Math.cos(sunAng) * 100, Math.max(5, Math.sin(sunAng) * 120), this.controls.target.z + 40);
    this.sun.target.position.copy(this.controls.target);
    this.sun.intensity = 0.25 + 2.1 * day;
    this.sun.color.setHSL(0.1, 0.5 * (1 - day) + 0.1, 0.65 + 0.3 * day);
    this.hemi.intensity = 0.35 + 0.85 * day;
    const haze = THREE.MathUtils.clamp((w.env.aqi - 50) / 250, 0, 1);
    const sky = new THREE.Color(0x8fb8de).lerp(new THREE.Color(0xc9bfa6), haze * 0.75).lerp(new THREE.Color(0x0a1022), night * 0.92);
    this.scene.background = sky;
    this.fog.color.copy(sky);
    this.fog.density = (0.0035 + haze * 0.02) * THREE.MathUtils.clamp(25 / Math.max(1, camDist), 0.04, 1.4);
    this.buildingMat.emissiveIntensity = night * 0.55;
    const doy = dayOfYear(w.date());
    const u = this.ground.uniforms;
    u.uDoy.value = doy;
    const ks = w.ag.share.kharif;
    const paddy = Object.entries(ks).filter(([k]) => /paddy/.test(k)).reduce((a, [, v]) => a + v, 0);
    u.uShares.value.set(paddy, ks.basmati ?? 0, 1 - paddy - (ks.basmati ?? 0), 0);
    const paddyHa = Object.entries(w.ag.area.kharif).filter(([k]) => /paddy|basmati/.test(k)).reduce((a, [, v]) => a + v, 0);
    u.uBurn.value = paddyHa > 0 ? THREE.MathUtils.clamp(w.env.burnHaSeason / paddyHa, 0, 1) : 0;
    const lineFade = THREE.MathUtils.smoothstep(camDist, 3, 18);
    for (const l of this.overlayLines) (l.material as LineMaterial).opacity = 0.25 + 0.7 * lineFade;

    this.updateTrucks(s);
    this.updateTrains(s);
    this.updateAgents(s);
    this.updateHeaps();
    this.updateFlows();
    this.updateFires(s);
    this.updateLabels(camDist);
    this.updateSelection(s);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  private updateTrucks(s: number) {
    const w = this.world;
    let i = 0;
    for (const tr of w.trucks) {
      const moving = tr.route && (tr.state === 'toPickup' || tr.state === 'loaded' || tr.state === 'returning');
      for (let k = 0; k < CONVOY; k++) {
        let x = tr.x, z = tr.z, hd = tr.heading, vis = this.layers.trucks;
        if (k > 0) {
          if (moving) {
            const p = along(tr.route!, tr.d - k * Math.max(0.05, s * 1.6));
            x = p.x; z = p.z; hd = p.heading;
          } else {
            // Parked: line trucks up side by side.
            x = tr.x + Math.cos(tr.heading) * k * s * 0.5; z = tr.z - Math.sin(tr.heading) * k * s * 0.5;
            vis = vis && s < 0.15;
          }
        }
        this.dummy.position.set(x, terrainHeight(x, z) + 0.004, z);
        this.dummy.rotation.set(0, hd, 0);
        const sc = vis ? s : 0;
        this.dummy.scale.set(sc, sc, sc);
        this.dummy.updateMatrix();
        this.trucksCab.setMatrixAt(i, this.dummy.matrix);
        this.trucksCargo.setMatrixAt(i, this.dummy.matrix);
        this.trucksCab.setColorAt(i, this.color.setHex(tr.color));
        const cc = tr.state === 'loaded' || tr.state === 'unloading' ? COMMODITY_COLORS[tr.job?.commodity ?? 'other'] ?? 0x868e96 : 0x5c5f66;
        this.trucksCargo.setColorAt(i, this.color.setHex(tr.typeId.includes('tank') ? 0xced4da : cc));
        i++;
      }
    }
    this.trucksCab.instanceMatrix.needsUpdate = true; this.trucksCargo.instanceMatrix.needsUpdate = true;
    if (this.trucksCab.instanceColor) this.trucksCab.instanceColor.needsUpdate = true;
    if (this.trucksCargo.instanceColor) this.trucksCargo.instanceColor.needsUpdate = true;
  }

  private updateTrains(s: number) {
    let i = 0;
    for (const t of this.world.trains) {
      for (let k = 0; k < 14 && i < 40 * 14; k++) {
        const p = along(t.route, t.d - k * Math.max(0.025, s * 1.1));
        this.dummy.position.set(p.x, terrainHeight(p.x, p.z) + 0.006, p.z);
        this.dummy.rotation.set(0, p.heading, 0);
        this.dummy.scale.set(s * 0.9, s * 0.9, s * 0.9);
        this.dummy.updateMatrix();
        this.trainMesh.setMatrixAt(i, this.dummy.matrix);
        this.trainMesh.setColorAt(i, this.color.setHex(k === 0 ? 0xc92a2a : 0x6f4e37));
        i++;
      }
    }
    this.trainMesh.count = i;
    this.trainMesh.instanceMatrix.needsUpdate = true;
    if (this.trainMesh.instanceColor) this.trainMesh.instanceColor.needsUpdate = true;
  }

  private updateAgents(s: number) {
    const w = this.world;
    const hs = this.layers.households ? w.households : [];
    const n = Math.min(MAX_HH, hs.length);
    const hsz = s * 0.32;
    // Household matrices only change when agents are added, so rebuild then; colors track sentiment.
    if (n !== this.hhCount || (w.dayIndex % 1 === 0)) {
      for (let i = 0; i < n; i++) {
        const h = hs[i];
        this.dummy.position.set(h.x, terrainHeight(h.x, h.z) + 0.002, h.z);
        this.dummy.rotation.set(0, 0, 0);
        const sz = hsz * (h.custom ? 1.8 : 1);
        this.dummy.scale.set(sz, sz, sz);
        this.dummy.updateMatrix();
        this.hhMesh.setMatrixAt(i, this.dummy.matrix);
        this.color.setHex(this.profileColors.get(h.profile.id) ?? 0xffffff).multiplyScalar(0.55 + h.sentiment * 0.7);
        this.hhMesh.setColorAt(i, this.color);
      }
      this.hhMesh.count = n; this.hhCount = n;
      this.hhMesh.instanceMatrix.needsUpdate = true;
      if (this.hhMesh.instanceColor) this.hhMesh.instanceColor.needsUpdate = true;
    }
    const bs = this.layers.businesses ? w.businesses : [];
    for (let i = 0; i < bs.length && i < this.bizMesh.instanceMatrix.count; i++) {
      const b = bs[i];
      const height = 0.4 + Math.log10(1 + b.revenueLastMonth / 1e6) * 0.55;
      this.dummy.position.set(b.x, terrainHeight(b.x, b.z), b.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(s * 0.45, s * height, s * 0.45);
      this.dummy.updateMatrix();
      this.bizMesh.setMatrixAt(i, this.dummy.matrix);
      this.bizMesh.setColorAt(i, this.color.setHex(ARCH_COLORS[b.archetype]));
    }
    this.bizMesh.count = bs.length;
    this.bizMesh.instanceMatrix.needsUpdate = true;
    if (this.bizMesh.instanceColor) this.bizMesh.instanceColor.needsUpdate = true;
  }

  private updateHeaps() {
    for (const [id, h] of this.heaps) {
      const stock = this.world.mandiStock.get(id) ?? {};
      const total = Object.values(stock).reduce((a, b) => a + b, 0);
      const waiting = this.world.jobs.filter(j => j.from === id && j.takenBy == null).reduce((a, j) => a + j.tonnes, 0);
      const n = Math.min(120, Math.round((total + waiting) / 600));
      const wheat = (stock.wheat ?? 0) > (stock.paddy ?? 0);
      for (let i = 0; i < n; i++) {
        const gx = (i % 12) - 5.5, gz = Math.floor(i / 12) - 4.5;
        this.dummy.position.set(h.x + gx * 0.034, 0.002, h.z + gz * 0.028);
        this.dummy.rotation.set(0, i, 0);
        const k = 0.8 + ((i * 7) % 5) * 0.1;
        this.dummy.scale.set(k, k, k);
        this.dummy.updateMatrix();
        h.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      (h.mesh.material as THREE.MeshStandardMaterial).color.setHex(wheat ? 0xc8962c : 0xe3cf7a);
      h.mesh.count = n;
      h.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateFlows() {
    const w = this.world;
    const pos = this.flowLines.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.flowLines.geometry.attributes.color as THREE.BufferAttribute;
    const hp = this.flowHeads.geometry.attributes.position as THREE.BufferAttribute;
    const hc = this.flowHeads.geometry.attributes.color as THREE.BufferAttribute;
    const SEG = 18;
    let n = 0;
    const flows = this.layers.flows ? w.flows : [];
    for (const f of flows) {
      if (n >= 400) break;
      const age = (w.hours - f.t0) / 10;             // 0..1 over 10 sim-hours
      const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
      if (len < 0.05) continue;
      const hgt = Math.min(25, len * 0.25 + 0.3);
      this.color.setHex(FLOW_COLORS[f.kind] ?? 0xffffff);
      const fade = 1 - age;
      const head = Math.min(1, age * 2.2);
      for (let k = 0; k < SEG; k++) {
        for (let e = 0; e < 2; e++) {
          const t = ((k + e) / SEG) * head;
          const vi = (n * SEG + k) * 2 + e;
          pos.setXYZ(vi, f.x0 + (f.x1 - f.x0) * t, Math.sin(t * Math.PI) * hgt + 0.02, f.z0 + (f.z1 - f.z0) * t);
          col.setXYZ(vi, this.color.r * fade, this.color.g * fade, this.color.b * fade);
        }
      }
      hp.setXYZ(n, f.x0 + (f.x1 - f.x0) * head, Math.sin(head * Math.PI) * hgt + 0.02, f.z0 + (f.z1 - f.z0) * head);
      hc.setXYZ(n, this.color.r, this.color.g, this.color.b);
      n++;
    }
    this.flowLines.geometry.setDrawRange(0, n * SEG * 2);
    this.flowHeads.geometry.setDrawRange(0, n);
    pos.needsUpdate = true; col.needsUpdate = true; hp.needsUpdate = true; hc.needsUpdate = true;
  }

  private updateFires(s: number) {
    const w = this.world;
    const fp = this.fire.geometry.attributes.position as THREE.BufferAttribute;
    const sp = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    let nf = 0, ns = 0;
    const t = w.hours;
    for (const h of w.households) {
      const f = h.farm;
      if (!f || f.stubble !== 'burned' || f.burnDay == null) continue;
      const age = w.t - f.burnDay;
      if (age < 0 || age > 3) continue;
      for (let k = 0; k < 6 && nf < 3000; k++) {
        const jx = Math.sin(h.id * 13.1 + k * 2.3) * 0.35, jz = Math.cos(h.id * 7.7 + k * 1.9) * 0.35;
        if (age < 1.2) fp.setXYZ(nf++, h.x + jx, 0.004 + Math.abs(Math.sin(t * 9 + k + h.id)) * 0.006, h.z + jz);
        for (let m = 0; m < 2 && ns < 6000; m++) {
          const rise = ((t * 0.6 + m * 0.5 + k * 0.17) % 1);
          sp.setXYZ(ns++, h.x + jx + rise * 0.6, rise * Math.max(0.15, s * 2), h.z + jz - rise * 0.3);
        }
      }
    }
    this.fire.geometry.setDrawRange(0, nf); this.smoke.geometry.setDrawRange(0, ns);
    fp.needsUpdate = true; sp.needsUpdate = true;
  }

  private updateLabels(camDist: number) {
    const show = this.layers.labels;
    const minImp = camDist > 160 ? 4 : camDist > 70 ? 3 : camDist > 22 ? 2 : 1;
    for (const l of this.labels) {
      const near = Math.hypot(l.x - this.controls.target.x, l.z - this.controls.target.z) < camDist * 2.2;
      l.obj.visible = show && l.importance >= minImp && near;
    }
  }

  private updateSelection(s: number) {
    const p = this.selectionPos();
    if (!p) { this.selRing.visible = false; return; }
    this.selRing.visible = true;
    this.selRing.position.set(p.x, terrainHeight(p.x, p.z) + 0.01, p.z);
    const k = Math.max(s * 1.2, 0.02) * (1 + 0.15 * Math.sin(performance.now() / 200));
    this.selRing.scale.set(k, k, k);
  }

  selectionPos(): XZ | null {
    const sel = this.selection, w = this.world;
    if (!sel) return null;
    if (sel.kind === 'truck') return w.trucks.find(t => t.id === sel.id) ?? null;
    if (sel.kind === 'household') return w.households.find(h => h.id === sel.id) ?? null;
    if (sel.kind === 'business') return w.biz(sel.id) ?? null;
    return w.place(sel.id) ?? null;
  }

  /** Screen-space nearest-object pick. */
  pick(clientX: number, clientY: number): Selection | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best: Selection | null = null, bd = 14 * 14;
    const test = (x: number, z: number, sel: Selection, bonus = 0) => {
      v.set(x, terrainHeight(x, z) + 0.01, z).project(this.camera);
      if (v.z > 1) return;
      const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = (sx - clientX) ** 2 + (sy - clientY) ** 2 - bonus;
      if (d < bd) { bd = d; best = sel; }
    };
    const w = this.world;
    for (const t of w.trucks) test(t.x, t.z, { kind: 'truck', id: t.id }, 30);
    if (this.layers.businesses) for (const b of w.businesses) test(b.x, b.z, { kind: 'business', id: b.id }, 10);
    if (this.layers.households) for (const h of w.households) test(h.x, h.z, { kind: 'household', id: h.id });
    for (const p of w.places.values()) if (p.type !== 'city' && p.type !== 'town') test(p.x, p.z, { kind: 'place', id: p.id }, 5);
    if (!best) for (const p of w.places.values()) test(p.x, p.z, { kind: 'place', id: p.id }, -60);
    return best;
  }

  /** World XZ under the cursor on the ground plane (for placing agents). */
  groundPoint(clientX: number, clientY: number): XZ | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.ground.mesh)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }
}

function dayOfYear(d: Date): number {
  return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
}

let dotTex: THREE.Texture | null = null;
function dotTexture(): THREE.Texture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}
