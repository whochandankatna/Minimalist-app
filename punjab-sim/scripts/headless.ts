// Runs the simulation without graphics and prints a calibration report.
// Usage: npm run headless -- [days] [seed]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDataset } from '../src/data/normalize';
import { World } from '../src/sim/world';
import { classifySector } from '../src/sim/model';

const days = Number(process.argv[2] ?? 365);
const seed = Number(process.argv[3] ?? 7);
const dir = join(import.meta.dirname, '../src/data');
const raw: Record<string, unknown> = {};
for (const f of ['geography', 'agriculture', 'businesses', 'logistics', 'psychographics']) {
  const p = join(dir, `${f}.json`);
  if (existsSync(p)) raw[f] = JSON.parse(readFileSync(p, 'utf8'));
}
const data = buildDataset(raw);
console.log('provenance', data.provenance);
const t0 = Date.now();
const w = new World(data, { seed });
console.log(`init ${Date.now() - t0}ms: ${w.households.length} households, ${w.businesses.length} firms, ${w.trucks.length} trucks, ${w.roads.nodes.length} road nodes`);
const unclassified = data.businesses.sectors.filter(s => classifySector(s) === 'other').map(s => s.id);
console.log('sectors mapped to "other":', unclassified.join(', ') || 'none');

const cr = (n: number) => `₹${(n / 1e7).toFixed(1)} cr`;
for (let d = 0; d < days; d++) {
  w.advance(24);
  if ((d + 1) % 30 === 0) {
    const s = w.stats;
    const l = s.flowsLastMonth;
    console.log(`${w.dateLabel().padEnd(12)} paddy ₹${s.last('paddyPrice').toFixed(0)} wheat ₹${s.last('wheatPrice').toFixed(0)} milk ₹${s.last('milkPrice').toFixed(1)} | `
      + `cons/mo ${cr(l.consumption ?? 0)} crop ${cr(l.crop_sale ?? 0)} proc ${cr(l.procurement ?? 0)} freight ${cr(l.freight ?? 0)} | `
      + `trucks ${(s.last('truckUtil') * 100).toFixed(0)}% jobsWait ${s.last('jobsWaiting')} backlog ${s.last('mandiBacklogT').toFixed(0)}t | `
      + `sent M ${s.last('sentimentMoga').toFixed(2)} C ${s.last('sentimentChd').toFixed(2)} labour ${s.last('employmentMoga').toFixed(2)} AQI ${s.last('aqi').toFixed(0)} cpi ${s.last('cpi').toFixed(3)}`);
  }
}
console.log(`ran ${days} days in ${Date.now() - t0}ms`);
console.log('kharif shares', w.ag.share.kharif, 'rabi', w.ag.share.rabi);
console.log('procured t', w.gov.procuredT, 'rakes', w.ag.rakesDispatched, 'burn ha', Math.round(w.env.burnHaSeason), 'gw', w.env.groundwaterDepthM.toFixed(1));
const byP = w.householdsByProfile();
for (const [id, hs] of byP) {
  const avg = (f: (h: typeof hs[0]) => number) => hs.reduce((a, h) => a + f(h), 0) / hs.length;
  console.log(`${id.padEnd(28)} n=${String(hs.length).padEnd(4)} inc/mo ${avg(h => h.incomeLastMonth).toFixed(0).padStart(7)} exp ${avg(h => h.expectedIncome).toFixed(0).padStart(7)} spend ${avg(h => h.spendLastMonth).toFixed(0).padStart(7)} cash ${avg(h => h.cash).toFixed(0).padStart(9)} debt ${avg(h => h.debtBank + h.debtArhtiya).toFixed(0).padStart(8)} sent ${avg(h => h.sentiment).toFixed(2)} abroad ${hs.filter(h => h.membersAbroad > 0).length}`);
}
const arch = new Map<string, { rev: number; profit: number; n: number }>();
for (const b of w.businesses) {
  const a = arch.get(b.archetype) ?? { rev: 0, profit: 0, n: 0 };
  a.rev += b.revenueLastMonth; a.profit += b.profitLastMonth; a.n++; arch.set(b.archetype, a);
}
for (const [k, v] of [...arch].sort((a, b) => b[1].rev - a[1].rev)) console.log(`${k.padEnd(20)} agents ${String(v.n).padEnd(3)} rev/mo ${cr(v.rev).padStart(12)} profit ${cr(v.profit).padStart(12)}`);
console.log('flows total', Object.fromEntries(Object.entries(w.stats.flowsTotal).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, cr(v)])));
console.log('last events', w.events.slice(-8).map(e => `${e.day}: ${e.text}`));
