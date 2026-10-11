// Local equirectangular projection centred on the Moga–Chandigarh corridor.
// World units are kilometres. +x = east, -z = north, +y = up.
export const LAT0 = 30.75;
export const LON0 = 75.7;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32 * Math.cos((LAT0 * Math.PI) / 180);

export interface XZ { x: number; z: number }

export function project(lat: number, lon: number): XZ {
  return { x: (lon - LON0) * KM_PER_DEG_LON, z: -(lat - LAT0) * KM_PER_DEG_LAT };
}

export function unproject(x: number, z: number): { lat: number; lon: number } {
  return { lat: LAT0 - z / KM_PER_DEG_LAT, lon: LON0 + x / KM_PER_DEG_LON };
}

export const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);
