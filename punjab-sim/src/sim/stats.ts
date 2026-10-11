// Daily time series and money-flow accounting for charts and exports.
import type { World } from './world';

export const SERIES = [
  'txVolume', 'consumption', 'hhIncome', 'cropSales', 'milkSales', 'procurement', 'freight', 'fuel', 'tolls',
  'wages', 'remittance', 'leakage', 'paddyPrice', 'wheatPrice', 'basmatiPrice', 'milkPrice', 'truckUtil',
  'jobsWaiting', 'mandiBacklogT', 'aqi', 'burns', 'sentimentMoga', 'sentimentChd', 'employmentMoga',
  'debtPerFarmHh', 'abroad', 'cpi',
] as const;
export type SeriesKey = typeof SERIES[number];

export const SERIES_LABEL: Record<SeriesKey, string> = {
  txVolume: 'All transactions ₹/day', consumption: 'Household consumption ₹/day', hhIncome: 'Household income ₹/day',
  cropSales: 'Crop sales ₹/day', milkSales: 'Milk sales ₹/day', procurement: 'State procurement ₹/day',
  freight: 'Truck freight ₹/day', fuel: 'Diesel spend ₹/day', tolls: 'Tolls ₹/day', wages: 'Wages ₹/day',
  remittance: 'Remittances ₹/day', leakage: 'Spend leaving region ₹/day', paddyPrice: 'Paddy ₹/qtl (private)',
  wheatPrice: 'Wheat ₹/qtl (private)', basmatiPrice: 'Basmati ₹/qtl', milkPrice: 'Milk ₹/L', truckUtil: 'Truck utilisation',
  jobsWaiting: 'Freight jobs waiting', mandiBacklogT: 'Unlifted grain in mandis (t)', aqi: 'AQI (Chandigarh)',
  burns: 'Stubble fires/day', sentimentMoga: 'Sentiment: Moga', sentimentChd: 'Sentiment: Tricity',
  employmentMoga: 'Labour demand index: Moga', debtPerFarmHh: 'Debt per farm household ₹', abroad: 'Households with member abroad',
  cpi: 'Local price index',
};

const MAX_DAYS = 1100;

export class Stats {
  series: Record<SeriesKey, number[]> = Object.fromEntries(SERIES.map(k => [k, []])) as unknown as Record<SeriesKey, number[]>;
  days: number[] = [];
  flowsToday: Record<string, number> = {};
  flowsTotal: Record<string, number> = {};
  flowsMonth: Record<string, number> = {};
  flowsLastMonth: Record<string, number> = {};

  addFlow(kind: string, amount: number) {
    this.flowsToday[kind] = (this.flowsToday[kind] ?? 0) + amount;
    this.flowsTotal[kind] = (this.flowsTotal[kind] ?? 0) + amount;
    this.flowsMonth[kind] = (this.flowsMonth[kind] ?? 0) + amount;
  }


  rollMonth() { this.flowsLastMonth = this.flowsMonth; this.flowsMonth = {}; }

  endDay(w: World) {
    const f = this.flowsToday;
    const g = (k: string) => f[k] ?? 0;
    let backlog = 0;
    for (const s of w.mandiStock.values()) for (const v of Object.values(s)) backlog += v;
    const sent = { moga: [0, 0], chandigarh: [0, 0] };
    let debt = 0, farmW = 0, abroad = 0;
    for (const h of w.households) {
      sent[h.region][0] += h.sentiment * h.weight; sent[h.region][1] += h.weight;
      if (h.farm) { debt += (h.debtBank + h.debtArhtiya) * h.weight; farmW += h.weight; }
      if (h.membersAbroad > 0) abroad += h.weight;
    }
    const vals: Record<SeriesKey, number> = {
      txVolume: Object.values(f).reduce((a, b) => a + b, 0),
      consumption: g('consumption'), hhIncome: g('wages') + g('salary') + g('remittance') + g('crop_sale') + g('milk_sale') + g('profit_draw'),
      cropSales: g('crop_sale'), milkSales: g('milk_sale'), procurement: g('procurement'), freight: g('freight'), fuel: g('fuel'),
      tolls: g('toll'), wages: g('wages'), remittance: g('remittance'), leakage: g('leakage'),
      paddyPrice: w.prices.paddy ?? 0, wheatPrice: w.prices.wheat ?? 0, basmatiPrice: w.prices.basmati ?? 0, milkPrice: w.prices.milk ?? 0,
      truckUtil: w.trucks.length ? Math.min(1, w.truckBusyHours / (24 * w.trucks.length)) : 0, jobsWaiting: w.jobs.filter(j => j.takenBy == null).length,
      mandiBacklogT: backlog, aqi: w.env.aqi, burns: w.env.burnsToday,
      sentimentMoga: sent.moga[1] ? sent.moga[0] / sent.moga[1] : 0,
      sentimentChd: sent.chandigarh[1] ? sent.chandigarh[0] / sent.chandigarh[1] : 0,
      employmentMoga: w.labourDemandIndex.moga, debtPerFarmHh: farmW ? debt / farmW : 0, abroad, cpi: w.prices.cpi,
    };
    this.days.push(w.dayIndex);
    for (const k of SERIES) {
      this.series[k].push(vals[k]);
      if (this.series[k].length > MAX_DAYS) this.series[k].shift();
    }
    if (this.days.length > MAX_DAYS) this.days.shift();
    // Reset after recording: hourly truck flows accumulate between day boundaries.
    this.flowsToday = {};
    w.truckBusyHours = 0;
  }

  last(k: SeriesKey): number { const s = this.series[k]; return s[s.length - 1] ?? 0; }
}
