// Constants shared across simulation modules (kept separate to avoid import cycles).
export const START_DATE = new Date(Date.UTC(2026, 9, 1)); // 1 Oct 2026: paddy procurement opens
export const TRUCK_SCALE = 10;                             // real trucks per truck agent
export const MOGA_HOUSEHOLDS = 225_000;                    // ~1.1M people / 4.9 per household (projection from Census 2011)
export const TRICITY_HOUSEHOLDS = 560_000;                 // ~2.3M people / 4.1 per household (projection)
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
