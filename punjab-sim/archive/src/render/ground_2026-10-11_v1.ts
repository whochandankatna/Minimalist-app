// Terrain: a displaced plane (Shivalik foothills NE of Chandigarh) with a
// procedural field shader. Each field cell follows the paddy–wheat calendar,
// using live crop shares and stubble-burning fractions from the simulation.
import * as THREE from 'three';
import { project } from '../geo/projection';

export interface GroundUniforms {
  uDoy: { value: number };
  uShares: { value: THREE.Vector4 };
  uBurn: { value: number };
  uUrban: { value: THREE.Vector3[] };
  uUrbanN: { value: number };
  uNight: { value: number };
}

const MAX_URBAN = 64;

/** Height of the Shivalik foothills in km (0 elsewhere; Punjab plains are flat). */
export function terrainHeight(x: number, z: number): number {
  const a = project(30.86, 76.72), b = project(30.55, 77.12);
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len;        // normal pointing NE
  const along = ((x - a.x) * dx + (z - a.z) * dz) / len;
  const across = (x - a.x) * nx + (z - a.z) * nz;
  if (along < -15 || along > len + 25) return 0;
  const rise = THREE.MathUtils.smoothstep(across, 2, 9);
  const ridges = 0.5 + 0.5 * Math.sin(x * 0.9 + z * 0.4) * Math.cos(z * 1.3 - x * 0.2) + 0.3 * Math.sin(x * 2.7 + z * 3.1);
  const fade = THREE.MathUtils.smoothstep(along, -15, 0) * (1 - THREE.MathUtils.smoothstep(along, len, len + 25));
  return rise * fade * (0.25 + 0.55 * ridges) * Math.min(1.6, 0.6 + Math.max(0, across - 9) * 0.04);
}

export function createGround(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const w = bounds.maxX - bounds.minX, h = bounds.maxZ - bounds.minZ;
  const geo = new THREE.PlaneGeometry(w, h, Math.round(w * 1.6), Math.round(h * 1.6));
  geo.rotateX(-Math.PI / 2);
  geo.translate(bounds.minX + w / 2, 0, bounds.minZ + h / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const uniforms: GroundUniforms = {
    uDoy: { value: 280 },
    uShares: { value: new THREE.Vector4(0.9, 0.05, 0.05, 0) },
    uBurn: { value: 0.3 },
    uUrban: { value: Array.from({ length: MAX_URBAN }, () => new THREE.Vector3(1e6, 1e6, 0)) },
    uUrbanN: { value: 0 },
    uNight: { value: 0 },
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uDoy; uniform vec4 uShares; uniform float uBurn; uniform float uNight;
uniform vec3 uUrban[${MAX_URBAN}]; uniform int uUrbanN;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 fieldColor(vec2 cell){
  float h1 = h21(cell), h2 = h21(cell + 17.3), h3 = h21(cell + 41.7);
  float d = mod(uDoy + (h2 - 0.5) * 22.0 + 365.0, 365.0);
  vec3 soil = vec3(0.50,0.41,0.30), dry = vec3(0.70,0.62,0.47), young = vec3(0.47,0.63,0.27);
  vec3 lush = vec3(0.20,0.43,0.13), paddy = vec3(0.24,0.52,0.16), golden = vec3(0.83,0.69,0.31);
  vec3 stub = vec3(0.74,0.64,0.40), burnt = vec3(0.17,0.15,0.13), flood = vec3(0.33,0.45,0.42);
  bool rice = h1 < uShares.x + uShares.y;
  bool burned = h3 < uBurn;
  vec3 c;
  if (d < 95.0) { c = mix(young, lush, smoothstep(0.0, 55.0, d)); c = mix(c, golden, smoothstep(75.0, 95.0, d)); }
  else if (d < 128.0) c = mix(golden, stub, smoothstep(98.0, 125.0, d));
  else if (d < 160.0) c = mix(stub, dry, smoothstep(128.0, 150.0, d));
  else if (d < 185.0) c = rice ? mix(flood, paddy * 0.9, smoothstep(165.0, 185.0, d)) : mix(dry, young, smoothstep(160.0, 182.0, d));
  else if (d < 265.0) c = rice ? paddy : mix(young, lush, 0.65);
  else if (d < 288.0) c = rice ? mix(paddy, golden, smoothstep(265.0, 284.0, d)) : mix(lush, golden, 0.7);
  else if (d < 312.0) c = mix(golden, burned ? burnt : stub, smoothstep(286.0, 300.0, d));
  else if (d < 336.0) c = mix(burned ? burnt : stub, soil, smoothstep(312.0, 330.0, d));
  else c = mix(soil, young, smoothstep(336.0, 365.0, d));
  return c * (0.88 + 0.22 * h3);
}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
  vec2 p = vWPos.xz / vec2(0.21, 0.13);           // ~killa-scale field strips (km)
  vec2 cell = floor(p);
  vec2 fw = fwidth(p);
  float lod = smoothstep(0.25, 0.9, max(fw.x, fw.y));
  vec3 fine = fieldColor(cell);
  vec2 f = fract(p);
  float bund = 1.0 - smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  fine = mix(fine, vec3(0.47,0.42,0.32), bund * 0.55 * (1.0 - lod));
  vec2 cc = floor(vWPos.xz / 1.6);
  vec3 coarse = mix(fieldColor(cc), fieldColor(cc + 3.1), 0.5);
  vec3 col = mix(fine, coarse, lod);
  // Shivalik foothills: scrub forest and bare slopes.
  float hill = smoothstep(0.03, 0.25, vWPos.y);
  col = mix(col, mix(vec3(0.30,0.40,0.20), vec3(0.52,0.46,0.34), h21(floor(vWPos.xz * 3.0))), hill);
  // Urban footprints.
  for (int i = 0; i < ${MAX_URBAN}; i++) {
    if (i >= uUrbanN) break;
    float dd = distance(vWPos.xz, uUrban[i].xy);
    float u = 1.0 - smoothstep(uUrban[i].z * 0.75, uUrban[i].z, dd);
    col = mix(col, vec3(0.62,0.60,0.56) * (0.92 + 0.1 * h21(floor(vWPos.xz * 12.0))), u * 0.85);
  }
  vec4 diffuseColor = vec4(col, opacity);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.name = 'ground';
  return { mesh, uniforms };
}

/** Rough course of the Sutlej and Beas, approximate. */
export const RIVERS: { name: string; pts: [number, number][]; width: number }[] = [
  { name: 'Sutlej', width: 0.45, pts: [[31.0, 76.62], [30.98, 76.52], [31.02, 76.38], [30.99, 76.2], [30.98, 76.02], [30.99, 75.86], [31.02, 75.77], [31.05, 75.6], [31.08, 75.45], [31.1, 75.3], [31.13, 75.15], [31.16, 74.97], [31.07, 74.8], [30.99, 74.62], [30.98, 74.5]] },
  { name: 'Beas', width: 0.35, pts: [[31.45, 75.3], [31.36, 75.18], [31.26, 75.05], [31.16, 74.97]] },
  { name: 'Ghaggar', width: 0.12, pts: [[30.75, 77.05], [30.62, 76.92], [30.5, 76.82], [30.38, 76.72], [30.25, 76.62]] },
];
