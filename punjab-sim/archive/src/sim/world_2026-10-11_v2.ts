// World state, initialisation from the research dataset, and the time loop.
// Economic modules (farming, households, businesses, logistics) are plain
// functions over this state so they can be read and tested on their own.
import type { Crop, Dataset, Place, Profile, TraitKey } from '../data/types';
import { project, dist, type XZ } from '../geo/projection';
import { Rng } from './rng';
import { RoadNetwork } from './roads';
import { defaultPolicy, type Policy } from './policy';
import {
  classifySector, DEFAULT_TRAITS, type Business, type Decision, type Flow, type Household, type Job,
  type Region, type TrainRun, type Traits, type Truck, type WorldEvent,
} from './model';
import { Stats } from './stats';
import { initFarms, farmingDaily } from './farming';
import { householdsDaily, householdsMonthly } from './households';
import { businessesDaily, businessesMonthly } from './businesses';
import { initTrucks, logisticsHourly, logisticsDaily } from './logistics';

import { START_DATE, MOGA_HOUSEHOLDS, TRICITY_HOUSEHOLDS, clamp01 } from './constants';
export { START_DATE, TRUCK_SCALE, clamp01 } from './constants';

export type AccountKind = 'hh' | 'biz' | 'gov' | 'ext' | 'truck';

export interface WorldOptions { seed?: number; mogaAgents?: number; tricityAgents?: number }

export class World {
  data: Dataset;
  rng: Rng;
  policy: Policy = defaultPolicy();
  roads: RoadNetwork;
  places = new Map<string, Place & XZ & { region: Region | 'external'; radius: number }>();
  /** time in days since START_DATE (fractional) */
  t = 0;
  dayIndex = 0;
  households: Household[] = [];
  businesses: Business[] = [];
  trucks: Truck[] = [];
  jobs: Job[] = [];
  trains: TrainRun[] = [];
  flows: Flow[] = [];
  events: WorldEvent[] = [];
  stats = new Stats();
  crops = new Map<string, Crop>();
  /** live private-market prices INR/qtl (milk INR/L) */
  prices: Record<string, number> = {};
  /** unlifted grain sitting in each mandi, tonnes by crop */
  mandiStock = new Map<string, Record<string, number>>();
  godownStock: Record<string, number> = { wheat: 0, rice: 0, paddy: 0 };
  milkPending = new Map<string, number>();   // litres waiting at village collection centres
  gov = { procurementSpend: 0, procuredT: { wheat: 0, paddy: 0, maize: 0 } as Record<string, number>, finesCollected: 0, subsidiesPaid: 0, pendingPayments: [] as { day: number; hh: number; amount: number }[] };
  env = { burnsToday: 0, burnHaSeason: 0, burnHaRecent: [] as number[], aqi: 90, groundwaterDepthM: 32, paddyShare: 0.9 };
  ag = {
    /** planted hectares (real, weighted) by crop for the current kharif / rabi season */
    area: { kharif: {} as Record<string, number>, rabi: {} as Record<string, number> },
    share: { kharif: {} as Record<string, number>, rabi: {} as Record<string, number> },
    arrivalsToday: {} as Record<string, number>,   // qtl reaching mandis today
    millRiceT: new Map<number, number>(),
    railheadT: 0, rakesDispatched: 0, rakeLoading: false,
    nestleMilkToday: 0,
  };
  labourPool: Record<Region, number> = { moga: 0, chandigarh: 0 };
  profitPool: Record<Region, number> = { moga: 0, chandigarh: 0 };
  freightSurge = 1;
  labourDemandIndex: Record<Region, number> = { moga: 1, chandigarh: 1 };
  key: {
    villages: string[]; mandis: string[]; godown: string; railhead: string; nestle: string;
    dairyAlt: string | null; mogaHub: string; tricityHub: string; mogaTowns: string[]; tricityPlaces: string[];
    railTo: string;
  };
  nextId = 1;
  private bizIndex = new Map<number, Business>();
  biz(id: number | null | undefined): Business | undefined {
    if (id == null) return undefined;
    if (this.bizIndex.size !== this.businesses.length) this.bizIndex = new Map(this.businesses.map(b => [b.id, b]));
    return this.bizIndex.get(id);
  }
  dayAccum = 0;
  /** monotonic counter of sim-hours for render interpolation */
  hours = 0;

  constructor(data: Dataset, opts: WorldOptions = {}) {
    this.data = data;
    this.rng = new Rng(opts.seed ?? 7);
    for (const c of data.agriculture.crops) this.crops.set(c.id, c);
    this.key = this.indexPlaces();
    this.roads = new RoadNetwork(data.geography.highways, [...this.places.values()]);
    this.initPrices();
    this.buildBusinesses();
    this.buildHouseholds(opts.mogaAgents ?? 3000, opts.tricityAgents ?? 2400);
    initFarms(this);
    this.seedLoanBooks();
    initTrucks(this);
    this.event('info', `Simulation starts ${this.dateLabel()}: paddy harvest and procurement season in Moga.`);
  }

  // ---------------------------------------------------------------- places
  private indexPlaces() {
    const geo = this.data.geography;
    const moga = geo.places.find(p => p.id === 'moga')!;
    const chd = geo.places.find(p => p.id === 'chandigarh')!;
    const mogaXZ = project(moga.lat, moga.lon), chdXZ = project(chd.lat, chd.lon);
    const add = (p: Place) => {
      const xz = project(p.lat, p.lon);
      const inMoga = /moga/i.test(p.district ?? '') || dist(xz, mogaXZ) < 32;
      const inChd = dist(xz, chdXZ) < 22;
      const region: Region | 'external' = inChd ? 'chandigarh' : inMoga ? 'moga' : 'external';
      const pop = p.population ?? 0;
      const radius = p.type === 'village_cluster' ? 3.2 : pop > 0 ? 0.5 + Math.sqrt(pop) / 260 : 0.4;
      this.places.set(p.id, { ...p, ...xz, region, radius });
    };
    for (const p of geo.places) add(p);

    const of = (pred: (p: Place & XZ & { region: string }) => boolean) => [...this.places.values()].filter(pred);
    let villages = of(p => p.type === 'village_cluster' && p.region === 'moga').map(p => p.id);
    if (villages.length < 4) {
      // Synthesize a ring of village clusters around Moga if research had too few.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const lat = moga.lat + Math.sin(a) * 0.12, lon = moga.lon + Math.cos(a) * 0.14;
        const id = `v_syn_${i}`;
        add({ id, name: `Village cluster ${i + 1}`, type: 'village_cluster', lat, lon, district: 'Moga' });
        villages.push(id);
      }
    }
    let mandis = of(p => p.type === 'mandi' && p.region === 'moga').map(p => p.id);
    if (!mandis.length) mandis = ['moga'];
    const nearestOf = (type: string, to: XZ, region?: string) => {
      const c = of(p => p.type === type && (!region || p.region === region));
      c.sort((a, b) => dist(a, to) - dist(b, to));
      return c[0]?.id;
    };
    const nestle = of(p => /nestl/i.test(p.name) || /nestl/i.test(p.id))[0]?.id ?? nearestOf('plant', mogaXZ, 'moga') ?? 'moga';
    const dairyAlt = of(p => p.type === 'dairy' || /verka|milkfed/i.test(p.name)).sort((a, b) => dist(a, mogaXZ) - dist(b, mogaXZ))[0]?.id ?? null;
    const godown = nearestOf('godown', mogaXZ, 'moga') ?? 'moga';
    const railhead = nearestOf('railhead', mogaXZ, 'moga') ?? 'moga';
    const ludhiana = this.places.get('ludhiana');
    const mogaHub = (ludhiana && (of(p => p.type === 'industrial' && dist(p, ludhiana) < 15)[0]?.id ?? 'ludhiana')) ?? 'moga';
    const tricityHub = nearestOf('industrial', chdXZ, 'chandigarh') ?? 'chandigarh';
    const mogaTowns = of(p => (p.type === 'town' || p.type === 'city') && p.region === 'moga').map(p => p.id);
    const tricityPlaces = of(p => (p.type === 'city' || p.type === 'town') && p.region === 'chandigarh').map(p => p.id);
    // Grain leaves Punjab by rail; animate rakes towards Ludhiana.
    const railTo = nearestOf('railhead', ludhiana ?? chdXZ) ?? 'ludhiana';
    return { villages, mandis, godown, railhead, nestle, dairyAlt, mogaHub, tricityHub, mogaTowns, tricityPlaces, railTo };
  }

  place(id: string) { return this.places.get(id); }

  scatter(placeId: string, scale = 1): XZ {
    const p = this.places.get(placeId)!;
    const r = Math.sqrt(this.rng.next()) * p.radius * scale;
    const a = this.rng.next() * Math.PI * 2;
    return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
  }

  /** Existing household debt starts on lenders' books so interest income is realistic. */
  private seedLoanBooks() {
    for (const r of ['moga', 'chandigarh'] as Region[]) {
      const banks = this.businesses.filter(b => b.archetype === 'finance' && b.region === r);
      if (!banks.length) continue;
      let total = 0;
      for (const h of this.households) if (h.region === r) total += h.debtBank * h.weight;
      for (const b of banks) b.loanBook += total / banks.length;
    }
    for (const h of this.households) {
      const a = this.biz(h.arhtiyaId);
      if (a) a.loanBook += h.debtArhtiya * h.weight;
    }
  }

  // ---------------------------------------------------------------- prices
  private initPrices() {
    for (const c of this.crops.values()) {
      const msp = c.msp?.inrPerQtl ?? null;
      this.prices[c.id] = c.privatePriceInrPerQtl ?? (msp ? msp * 0.97 : 2000);
    }
    this.prices.milk = this.milkPriceBase();
    this.prices.cpi = 1;
  }

  msp(cropId: string): number | null {
    const c = this.crops.get(cropId);
    const base = c?.msp?.inrPerQtl ?? null;
    if (base == null) return null;
    if (cropId === 'wheat') return base * this.policy.mspWheatMult;
    if (/paddy/.test(cropId)) return base * this.policy.mspPaddyMult;
    return base;
  }

  /** Is the state buying this crop at MSP in quantity? */
  procured(cropId: string): boolean {
    if (cropId === 'maize') return this.policy.maizeAssuredProcurement;
    const c = this.crops.get(cropId);
    return (c?.procurementShare ?? 0) >= 0.4 && this.msp(cropId) != null;
  }

  milkPriceBase(): number {
    const p = this.data.agriculture.dairy?.procurementPriceInrPerLitre ?? {};
    const vals = Object.values(p).filter((v): v is number => typeof v === 'number' && v > 10 && v < 150);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 45;
  }

  diesel(): number {
    return this.policy.dieselPrice ?? this.data.logistics.fuel?.dieselInrPerLitrePunjab ?? this.data.agriculture.inputs?.dieselInrPerLitre ?? 88;
  }

  /** Arhtiya commission as % of MSP. The Centre pays a fixed ₹/qtl on central-pool grain when researched. */
  commissionPct(cropId = 'paddy'): number {
    if (this.policy.arhtiyaCommissionPct != null) return this.policy.arhtiyaCommissionPct;
    const ms = this.data.agriculture.mandiSystem as { arhtiyaCommissionInrPerQtl?: Record<string, unknown>; arhtiyaCommissionPct?: number | null } | undefined;
    const perQtl = ms?.arhtiyaCommissionInrPerQtl?.[cropId];
    const msp = this.msp(cropId);
    if (typeof perQtl === 'number' && msp) return (perQtl / msp) * 100;
    return ms?.arhtiyaCommissionPct ?? 2.5;
  }

  // ---------------------------------------------------------------- agents
  private buildBusinesses() {
    const sectors = this.data.businesses.sectors;
    for (const s of sectors) {
      const arch = classifySector(s);
      const regions: Region[] = s.region === 'both' ? ['moga', 'chandigarh'] : s.region === 'chandigarh' ? ['chandigarh'] : ['moga'];
      for (const region of regions) {
        let count = s.estimatedCount ?? 100;
        if (s.region === 'both') count *= region === 'moga' ? 0.35 : 0.65;
        count = Math.max(1, count);
        const agents = Math.max(1, Math.min(24, Math.ceil(count / 120)));
        const typicalRev = s.annualRevenueInrTypical ?? defaultRevenue(arch);
        for (let i = 0; i < agents; i++) {
          const placeId = this.businessPlace(arch, region);
          const pt = this.scatter(placeId, arch === 'it_services' ? 0.5 : 0.8);
          const weight = count / agents;
          const baseDaily = (typicalRev * weight) / 365;
          this.businesses.push({
            id: this.nextId++, sector: s, archetype: arch, name: `${s.name} #${i + 1}`, region, placeId, x: pt.x, z: pt.z,
            weight, cash: baseDaily * 20, inventory: baseDaily * 12, inventoryTarget: baseDaily * 14,
            priceIndex: this.rng.range(0.94, 1.06), baseDailyRevenue: baseDaily,
            revenueDay: 0, revenueMonth: 0, revenueLastMonth: baseDaily * 30, costMonth: 0, profitLastMonth: 0,
            customersDay: 0, receivables: 0, loanBook: 0, grainQtl: 0, restockPending: false,
            supplierPlace: region === 'moga' ? this.key.mogaHub : this.key.tricityHub, history: [], log: [],
          });
        }
      }
    }
    // Anchor institutions always exist even if research omitted them.
    const ensure = (arch: Business['archetype'], name: string, region: Region, placeId: string, annual: number, weight = 1) => {
      if (this.businesses.some(b => b.archetype === arch && b.region === region)) return;
      const pt = this.scatter(placeId, 0.3);
      const baseDaily = annual / 365;
      this.businesses.push({
        id: this.nextId++, sector: { id: arch, name, region }, archetype: arch, name, region, placeId, x: pt.x, z: pt.z, weight,
        cash: baseDaily * 20, inventory: baseDaily * 10, inventoryTarget: baseDaily * 12, priceIndex: 1, baseDailyRevenue: baseDaily,
        revenueDay: 0, revenueMonth: 0, revenueLastMonth: baseDaily * 30, costMonth: 0, profitLastMonth: 0, customersDay: 0,
        receivables: 0, loanBook: 0, grainQtl: 0, restockPending: false, supplierPlace: this.key.mogaHub, history: [], log: [],
      });
    };
    ensure('arhtiya', 'Arhtiyas (commission agents)', 'moga', this.key.mandis[0], 3e6, 1000);
    ensure('rice_mill', 'Rice shellers', 'moga', 'moga', 4e7, 200);
    ensure('retail_grocery', 'Kiryana stores', 'moga', 'moga', 3e6, 3000);
    ensure('retail_grocery', 'Kiryana stores', 'chandigarh', 'chandigarh', 5e6, 6000);
    ensure('finance', 'Banks & cooperatives', 'moga', 'moga', 5e7, 150);
    ensure('finance', 'Banks & cooperatives', 'chandigarh', 'chandigarh', 8e7, 400);
    ensure('transporter', 'Transporters', 'moga', 'moga', 5e6, 300);
    // Nestlé Moga gets its own agent so milk and FMCG flows are visible.
    const nestle = this.places.get(this.key.nestle)!;
    this.businesses.push({
      id: this.nextId++, sector: { id: 'nestle_moga', name: 'Nestlé India – Moga factory', region: 'moga' }, archetype: 'dairy',
      name: 'Nestlé Moga factory', region: 'moga', placeId: this.key.nestle, x: nestle.x, z: nestle.z, weight: 1,
      cash: 5e8, inventory: 0, inventoryTarget: 0, priceIndex: 1, baseDailyRevenue: 0, revenueDay: 0, revenueMonth: 0,
      revenueLastMonth: 0, costMonth: 0, profitLastMonth: 0, customersDay: 0, receivables: 0, loanBook: 0, grainQtl: 0,
      restockPending: false, supplierPlace: this.key.mogaHub, history: [], log: [],
    });
  }

  private businessPlace(arch: Business['archetype'], region: Region): string {
    const k = this.key;
    if (region === 'moga') {
      if (arch === 'arhtiya') return this.rng.pick(k.mandis);
      if (arch === 'dairy') return this.rng.chance(0.6) ? this.rng.pick(k.villages) : 'moga';
      if (arch === 'rice_mill' || arch === 'cold_store') return this.rng.chance(0.5) ? 'moga' : this.rng.pick(k.mogaTowns.length ? k.mogaTowns : ['moga']);
      return this.rng.chance(0.68) || !k.mogaTowns.length ? 'moga' : this.rng.pick(k.mogaTowns);
    }
    if (arch === 'it_services') return this.places.has('mohali') && this.rng.chance(0.6) ? 'mohali' : 'chandigarh';
    if (arch === 'manufacturing' || arch === 'wholesale') return k.tricityHub;
    const list = k.tricityPlaces.length ? k.tricityPlaces : ['chandigarh'];
    return this.rng.weighted(list, id => Math.sqrt(this.places.get(id)?.population ?? 50_000));
  }

  private buildHouseholds(mogaN: number, tricityN: number) {
    const profiles = this.data.psychographics.profiles;
    for (const region of ['moga', 'chandigarh'] as Region[]) {
      const n = region === 'moga' ? mogaN : tricityN;
      const total = region === 'moga' ? MOGA_HOUSEHOLDS : TRICITY_HOUSEHOLDS;
      const ps = profiles.filter(p => p.region === region);
      const shareSum = ps.reduce((a, p) => a + p.shareOfHouseholds, 0) || 1;
      for (const p of ps) {
        const k = Math.max(4, Math.round((n * p.shareOfHouseholds) / shareSum));
        const weight = (total * (p.shareOfHouseholds / shareSum)) / k;
        for (let i = 0; i < k; i++) this.addHousehold(p, region, weight);
      }
    }
  }

  homePlaceFor(p: Profile, region: Region): string {
    const k = this.key;
    if (region === 'chandigarh') {
      const list = k.tricityPlaces.length ? k.tricityPlaces : ['chandigarh'];
      return this.rng.weighted(list, id => this.places.get(id)?.population ?? 1000);
    }
    const rural = (p.incomeSources.crops ?? 0) + (p.incomeSources.dairy ?? 0) + (/labou?r|farm|dairy|rural/i.test(p.name) ? 0.5 : 0);
    if (rural > 0.4) return this.rng.pick(k.villages);
    return this.rng.chance(0.75) || !k.mogaTowns.length ? 'moga' : this.rng.pick(k.mogaTowns);
  }

  addHousehold(p: Profile, region: Region, weight: number, opts: { placeId?: string; at?: XZ; traits?: Partial<Traits>; custom?: boolean } = {}): Household {
    const placeId = opts.placeId ?? this.homePlaceFor(p, region);
    const pt = opts.at ?? this.scatter(placeId);
    const traits = { ...DEFAULT_TRAITS } as Traits;
    for (const k of Object.keys(traits) as TraitKey[]) {
      const base = (opts.traits?.[k] ?? p.traits[k] ?? DEFAULT_TRAITS[k]) as number;
      const sd = k === 'lossAversion' ? 0.25 : 0.08;
      traits[k] = opts.traits?.[k] != null ? base : k === 'lossAversion' ? Math.max(1, this.rng.normal(base, sd)) : clamp01(this.rng.normal(base, sd));
    }
    const inc = p.monthlyIncomeInr;
    const income = Math.min(inc.max, Math.max(inc.min, this.rng.lognormal(inc.median, 0.35)));
    const src = p.incomeSources;
    const hh: Household = {
      id: this.nextId++, profile: p, region, placeId, x: pt.x, z: pt.z, weight, traits,
      expectedIncome: income,
      wageIncomeExpected: income * (src.wages ?? 0),
      salaryExpected: income * ((src.salary ?? 0) + (src.pension ?? 0)),
      remitExpected: income * (src.remittance ?? 0),
      businessIncomeExpected: income * ((src.business ?? 0) + (src.rent ?? 0)),
      cash: income * this.rng.range(0.5, 2.5) * (1 + (p.savingsRate ?? 0.1) * 4),
      debtBank: 0, debtArhtiya: 0, udhaar: 0, arhtiyaId: null, loyalty: {}, farm: null,
      sentiment: 0.6, incomeMonth: 0, spendMonth: 0, incomeLastMonth: income, spendLastMonth: income * (1 - (p.savingsRate ?? 0.1)),
      migration: 'none', migrationTimer: 0, membersAbroad: (src.remittance ?? 0) > 0.2 ? 1 : 0, weddingPlannedDay: null,
      log: [], custom: !!opts.custom,
    };
    this.households.push(hh);
    return hh;
  }

  // ---------------------------------------------------------------- money
  /** Moves aggregate INR between accounts and records it. `perHh` amounts must be multiplied by weight by the caller. */
  transfer(kind: string, amount: number, from: { k: AccountKind; id?: number; x?: number; z?: number } | null, to: { k: AccountKind; id?: number; x?: number; z?: number } | null) {
    if (!(amount > 0)) return;
    this.stats.addFlow(kind, amount);
    if (from && to && from.x != null && to.x != null && amount > 2e6 && this.flows.length < 400 && this.rng.chance(0.35)) {
      this.flows.push({ x0: from.x, z0: from.z!, x1: to.x, z1: to.z!, kind, amount, t0: this.hours });
    }
  }

  hhAcct(h: Household) { return { k: 'hh' as const, id: h.id, x: h.x, z: h.z }; }
  bizAcct(b: Business) { return { k: 'biz' as const, id: b.id, x: b.x, z: b.z }; }
  placeAcct(id: string, k: AccountKind = 'ext') { const p = this.places.get(id); return { k, x: p?.x, z: p?.z }; }

  note(target: { log: Decision[] }, kind: string, text: string) {
    target.log.push({ day: this.dayIndex, kind, text });
    if (target.log.length > 14) target.log.shift();
  }

  event(kind: WorldEvent['kind'], text: string) {
    this.events.push({ day: this.dayIndex, text, kind });
    if (this.events.length > 300) this.events.shift();
  }

  // ---------------------------------------------------------------- time
  date(t = this.t): Date { return new Date(START_DATE.getTime() + t * 86400000); }
  month(): number { return this.date().getUTCMonth() + 1; }
  dayOfMonth(): number { return this.date().getUTCDate(); }
  hourOfDay(): number { return (this.t % 1) * 24; }
  dateLabel(): string {
    return this.date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  /** Advance the world by `hours` of simulated time. */
  advance(hours: number) {
    let left = hours;
    while (left > 0) {
      const step = Math.min(left, 0.5);
      logisticsHourly(this, step);
      this.t += step / 24;
      this.hours += step;
      left -= step;
      const d = Math.floor(this.t);
      if (d > this.dayIndex) { this.dayIndex = d; this.daily(); }
    }
    // Expire old money-flow arcs used by the renderer.
    if (this.flows.length) this.flows = this.flows.filter(f => this.hours - f.t0 < 10);
  }

  private daily() {
    this.stats.beginDay(this.dayIndex);
    if (this.dayOfMonth() === 1) {
      householdsMonthly(this);
      businessesMonthly(this);
    }
    farmingDaily(this);
    householdsDaily(this);
    businessesDaily(this);
    logisticsDaily(this);
    this.stats.endDay(this);
  }

  // ---------------------------------------------------------------- queries
  householdsByProfile() {
    const m = new Map<string, Household[]>();
    for (const h of this.households) {
      const a = m.get(h.profile.id) ?? [];
      a.push(h); m.set(h.profile.id, a);
    }
    return m;
  }
}


function defaultRevenue(arch: Business['archetype']): number {
  const table: Partial<Record<Business['archetype'], number>> = {
    arhtiya: 3e6, rice_mill: 4e7, flour_mill: 2e7, input_dealer: 1.5e7, retail_grocery: 2.5e6, retail_cloth: 3e6,
    retail_electronics: 5e6, jeweller: 2e7, education: 1e7, immigration: 8e6, health: 6e6, fuel: 6e7, transporter: 6e6,
    food_service: 3e6, auto_dealer: 8e7, it_services: 5e7, real_estate: 2e7, events: 1.5e7, finance: 5e7, dairy: 2e7,
    hospitality: 1e7, manufacturing: 5e7, wholesale: 4e7, ecommerce: 2e7, cold_store: 1e7, repair: 1.5e6, other: 4e6,
  };
  return table[arch] ?? 4e6;
}
