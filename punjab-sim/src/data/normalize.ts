// Turns raw research JSON (which may be partial or slightly off-schema) into a
// Dataset the simulation can trust. Missing files fall back to the seed.
import type { Dataset, Geography, Profile, Psychographics } from './types';
import { seedAgriculture, seedBusinesses, seedGeography, seedLogistics, seedPsychographics } from './seed';

type Raw = Partial<Record<'geography' | 'agriculture' | 'businesses' | 'logistics' | 'psychographics', unknown>>;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function normalizeShares<T extends Record<string, number>>(o: T | undefined): T {
  const out = { ...(o ?? {}) } as Record<string, number>;
  let sum = 0;
  for (const k of Object.keys(out)) { if (!isNum(out[k]) || out[k] < 0) out[k] = 0; sum += out[k]; }
  if (sum > 0) for (const k of Object.keys(out)) out[k] /= sum;
  return out as T;
}

function cleanGeography(g: Geography): Geography {
  const places = (g.places ?? []).filter(p => p && p.id && isNum(p.lat) && isNum(p.lon));
  const highways = (g.highways ?? [])
    .map(h => ({ ...h, waypoints: (h.waypoints ?? []).filter(w => Array.isArray(w) && isNum(w[0]) && isNum(w[1])) }))
    .filter(h => h.waypoints.length >= 2);
  const railways = (g.railways ?? [])
    .map(r => ({ ...r, waypoints: (r.waypoints ?? []).filter(w => Array.isArray(w) && isNum(w[0]) && isNum(w[1])) }))
    .filter(r => r.waypoints.length >= 2);
  // Research must keep both anchor cities; borrow from seed if absent.
  for (const id of ['moga', 'chandigarh']) {
    if (!places.some(p => p.id === id)) places.push(seedGeography.places.find(p => p.id === id)!);
  }
  return { ...g, places, highways: highways.length ? highways : seedGeography.highways, railways };
}

function cleanProfile(p: Profile): Profile {
  const income = p.monthlyIncomeInr ?? { min: 10000, median: 20000, max: 40000 };
  return {
    ...p,
    region: p.region === 'chandigarh' ? 'chandigarh' : 'moga',
    shareOfHouseholds: isNum(p.shareOfHouseholds) ? p.shareOfHouseholds : 0.05,
    monthlyIncomeInr: {
      min: isNum(income.min) ? income.min : income.median * 0.5,
      median: isNum(income.median) ? income.median : 20000,
      max: isNum(income.max) ? income.max : income.median * 2,
    },
    incomeSources: normalizeShares(p.incomeSources),
    consumptionShares: normalizeShares(p.consumptionShares as Record<string, number>),
    paymentMix: normalizeShares(p.paymentMix),
    savingsRate: isNum(p.savingsRate) ? Math.min(0.6, Math.max(-0.2, p.savingsRate)) : 0.1,
    traits: Object.fromEntries(Object.entries(p.traits ?? {}).filter(([, v]) => isNum(v))),
  };
}

export function buildDataset(raw: Raw): Dataset {
  const has = (k: keyof Raw) => raw[k] != null && typeof raw[k] === 'object';
  const geography = cleanGeography((has('geography') ? raw.geography : seedGeography) as Geography);
  const agriculture = (has('agriculture') ? raw.agriculture : seedAgriculture) as Dataset['agriculture'];
  if (!Array.isArray(agriculture.crops) || !agriculture.crops.length) agriculture.crops = seedAgriculture.crops;
  const businesses = (has('businesses') ? raw.businesses : seedBusinesses) as Dataset['businesses'];
  if (!Array.isArray(businesses.sectors) || !businesses.sectors.length) businesses.sectors = seedBusinesses.sectors;
  const logistics = (has('logistics') ? raw.logistics : seedLogistics) as Dataset['logistics'];
  if (!logistics.truckTypes?.length) logistics.truckTypes = seedLogistics.truckTypes;
  const psyRaw = (has('psychographics') ? raw.psychographics : seedPsychographics) as Psychographics;
  const profiles = (psyRaw.profiles?.length ? psyRaw.profiles : seedPsychographics.profiles).map(cleanProfile);
  for (const region of ['moga', 'chandigarh']) {
    if (!profiles.some(p => p.region === region)) {
      profiles.push(...seedPsychographics.profiles.filter(p => p.region === region).map(cleanProfile));
    }
  }
  return {
    geography, agriculture, businesses, logistics,
    psychographics: { ...psyRaw, profiles },
    provenance: {
      geography: has('geography'), agriculture: has('agriculture'), businesses: has('businesses'),
      logistics: has('logistics'), psychographics: has('psychographics'),
    },
  };
}
