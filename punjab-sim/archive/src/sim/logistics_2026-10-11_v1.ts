// Trucks, freight jobs, dispatch (open market vs union turn system), tolls, diesel, trains.
import type { Commodity, Job, Truck } from './model';
import { along } from './roads';
import { TRUCK_SCALE } from './constants';
import type { World } from './world';

const LOAD_HOURS = 2.5;
const UNLOAD_HOURS = 2;
const DRIVER_WAGE_PER_DAY = 800;
const TRUCK_COLORS = [0xd9480f, 0x1971c2, 0xf08c00, 0x2f9e44, 0xc2255c, 0x5f3dc4, 0xe8590c, 0x0b7285, 0xffd43b];

export interface JobSpec {
  from: string; to: string; commodity: Commodity; tonnes: number;
  payerKind: Job['payerKind']; payerId: number; onDeliver?: () => void;
}

export function freightRate(w: World): number {
  return w.policy.freightRatePerTkm * (w.policy.freightRegime === 'cartel' ? 1.55 : w.freightSurge) * (0.85 + 0.15 * w.diesel() / 95.6);
}

export function postJob(w: World, s: JobSpec) {
  const r = w.roads.route(s.from, s.to);
  if (!r || s.from === s.to) { s.onDeliver?.(); return; }
  // Short hauls carry a minimum charge (loading time dominates).
  const km = Math.max(25, r.km);
  const pay = s.tonnes * km * freightRate(w);
  w.jobs.push({
    id: w.nextId++, from: s.from, to: s.to, commodity: s.commodity, tonnes: s.tonnes, pay,
    createdDay: w.dayIndex, payerKind: s.payerKind, payerId: s.payerId, takenBy: null,
    onDeliver: s.onDeliver as Job['onDeliver'],
  });
}

export function initTrucks(w: World) {
  const types = w.data.logistics.truckTypes ?? [];
  const transporters = w.businesses.filter(b => b.archetype === 'transporter');
  const mogaT = transporters.filter(b => b.region === 'moga');
  const chdT = transporters.filter(b => b.region === 'chandigarh');
  const N = 240;
  for (let i = 0; i < N; i++) {
    const tt = w.rng.weighted(types, t => t.share ?? 0.25);
    const r = w.rng.next();
    const home = r < 0.68 ? (w.rng.chance(0.75) ? 'moga' : w.rng.pick(w.key.mogaTowns.length ? w.key.mogaTowns : ['moga']))
      : r < 0.85 ? w.rng.pick(w.key.tricityPlaces.length ? w.key.tricityPlaces : ['chandigarh']) : w.key.mogaHub;
    const region = w.place(home)?.region;
    const owners = region === 'chandigarh' ? chdT : mogaT;
    const p = w.place(home)!;
    w.trucks.push({
      id: w.nextId++, typeId: tt.id, typeName: tt.name, payload: tt.payloadTonnes, kmpl: tt.kmPerLitreLoaded ?? 4,
      ownerBizId: owners.length ? w.rng.pick(owners).id : null, home, at: home, state: 'idle', route: null, d: 0, timer: 0, job: null,
      x: p.x + w.rng.range(-0.4, 0.4), z: p.z + w.rng.range(-0.4, 0.4), heading: w.rng.range(0, 6.28),
      color: w.rng.pick(TRUCK_COLORS), kmMonth: 0, earnMonth: 0, fuelMonth: 0, tollMonth: 0,
      kmTotal: 0, earnTotal: 0, tripsTotal: 0, idleHours: w.rng.range(0, 10), busyHours: 0,
    });
  }
}

function tollCost(w: World, names: string[]): number {
  const table = w.data.logistics.tolls ?? [];
  let sum = 0;
  for (const n of names) {
    const t = table.find(x => x.plaza && (x.plaza.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(x.plaza.toLowerCase().split(/[ /(]/)[0])));
    sum += t?.inrPerTripHeavy ?? 450;
  }
  return sum * w.policy.tollMult * TRUCK_SCALE;
}

function regionOf(w: World, place: string) { return w.place(place)?.region ?? 'external'; }

function startLeg(w: World, tr: Truck, to: string): boolean {
  const r = w.roads.route(tr.at, to);
  if (!r) return false;
  tr.route = r; tr.d = 0;
  const toll = tollCost(w, r.tolls);
  if (toll > 0) {
    tr.tollMonth += toll;
    payOwner(w, tr, -toll);
    w.transfer('toll', toll, null, null);
  }
  return true;
}

function payOwner(w: World, tr: Truck, amount: number) {
  const o = w.biz(tr.ownerBizId);
  if (!o) return;
  o.cash += amount;
  if (amount > 0) { o.revenueDay += amount; o.revenueMonth += amount; } else o.costMonth -= amount;
}

function dispatch(w: World) {
  const waiting = w.jobs.filter(j => j.takenBy == null);
  if (!waiting.length) return;
  const idle = w.trucks.filter(t => t.state === 'idle');
  if (!idle.length) return;
  const cartel = w.policy.freightRegime === 'cartel';
  if (cartel) {
    // Union turn system: oldest-idle local truck gets the next job from its own area.
    idle.sort((a, b) => b.idleHours - a.idleHours);
    for (const job of waiting.sort((a, b) => a.createdDay - b.createdDay)) {
      const reg = regionOf(w, job.from);
      const i = idle.findIndex(t => regionOf(w, t.home) === reg || reg === 'external');
      if (i < 0) continue;
      assign(w, idle.splice(i, 1)[0], job);
      if (!idle.length) break;
    }
  } else {
    // Open market: each job goes to the nearest idle truck.
    for (const job of waiting) {
      const fp = w.place(job.from);
      if (!fp) continue;
      let best = -1, bd = 90;
      for (let i = 0; i < idle.length; i++) {
        const d = Math.hypot(idle[i].x - fp.x, idle[i].z - fp.z);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) continue;
      assign(w, idle.splice(best, 1)[0], job);
      if (!idle.length) break;
    }
  }
}

function assign(w: World, tr: Truck, job: Job) {
  job.takenBy = tr.id; tr.job = job; tr.idleHours = 0;
  if (tr.at === job.from) { tr.state = 'loading'; tr.timer = LOAD_HOURS; tr.route = null; return; }
  if (startLeg(w, tr, job.from)) tr.state = 'toPickup';
  else { tr.state = 'loading'; tr.timer = LOAD_HOURS; }
}

function burnDiesel(w: World, tr: Truck, km: number, loaded: boolean) {
  const litres = (km / (loaded ? tr.kmpl : tr.kmpl * 1.3)) * TRUCK_SCALE;
  const cost = litres * w.diesel();
  tr.fuelMonth += cost; tr.kmMonth += km; tr.kmTotal += km;
  payOwner(w, tr, -cost);
  const reg = regionOf(w, tr.at) === 'chandigarh' ? 'chandigarh' : 'moga';
  const pump = pumpFor(w, reg);
  if (pump) { pump.cash += cost; pump.revenueDay += cost; pump.revenueMonth += cost; }
  w.transfer('fuel', cost, null, pump ? w.bizAcct(pump) : null);
}

export function logisticsHourly(w: World, dt: number) {
  dispatch(w);
  for (const tr of w.trucks) {
    switch (tr.state) {
      case 'idle':
        tr.idleHours += dt;
        if (tr.at !== tr.home && tr.idleHours > 18 && startLeg(w, tr, tr.home)) tr.state = 'returning';
        break;
      case 'loading':
        tr.timer -= dt; tr.busyHours += dt;
        if (tr.timer <= 0 && tr.job) {
          if (startLeg(w, tr, tr.job.to)) tr.state = 'loaded';
          else { tr.state = 'unloading'; tr.timer = UNLOAD_HOURS; }
        }
        break;
      case 'unloading':
        tr.timer -= dt; tr.busyHours += dt;
        if (tr.timer <= 0) deliver(w, tr);
        break;
      case 'toPickup': case 'loaded': case 'returning': {
        tr.busyHours += dt;
        const r = tr.route!;
        const speed = (r.km / Math.max(0.1, r.hours)) * nightFactor(w);
        const step = speed * dt;
        const total = r.cum[r.cum.length - 1];
        const before = tr.d;
        tr.d = Math.min(total, tr.d + step);
        burnDiesel(w, tr, (tr.d - before) * (r.km / Math.max(0.01, total)), tr.state === 'loaded');
        const p = along(r, tr.d);
        tr.x = p.x; tr.z = p.z; tr.heading = p.heading;
        if (tr.d >= total) {
          if (tr.state === 'toPickup') { tr.at = tr.job!.from; tr.state = 'loading'; tr.timer = LOAD_HOURS; }
          else if (tr.state === 'loaded') { tr.at = tr.job!.to; tr.state = 'unloading'; tr.timer = UNLOAD_HOURS; }
          else { tr.at = tr.home; tr.state = 'idle'; tr.idleHours = 0; }
          tr.route = null;
        }
        break;
      }
    }
  }
  for (const train of w.trains) train.d += 45 * dt;
  w.trains = w.trains.filter(t => t.d < t.route.cum[t.route.cum.length - 1]);
}

let pumps: { n: number; m: Record<string, ReturnType<World['biz']>> } = { n: -1, m: {} };
function pumpFor(w: World, reg: string) {
  if (pumps.n !== w.businesses.length) {
    pumps = { n: w.businesses.length, m: {} };
    for (const r of ['moga', 'chandigarh']) pumps.m[r] = w.businesses.find(b => b.archetype === 'fuel' && b.region === r);
  }
  return pumps.m[reg];
}

const nightFactor = (w: World) => { const h = w.hourOfDay(); return h < 5 || h > 22 ? 1.1 : h > 8 && h < 20 ? 0.92 : 1; };

function deliver(w: World, tr: Truck) {
  const job = tr.job!;
  (job.onDeliver as (() => void) | undefined)?.();
  payOwner(w, tr, job.pay);
  tr.earnMonth += job.pay; tr.earnTotal += job.pay; tr.tripsTotal++;
  if (job.payerKind === 'biz') {
    const p = w.biz(job.payerId);
    if (p) { p.cash -= job.pay; p.costMonth += job.pay; }
  }
  const to = w.place(job.to);
  w.transfer('freight', job.pay, job.payerKind === 'gov' ? w.placeAcct(job.to, 'gov') : to ? { k: 'biz', x: to.x, z: to.z } : null, { k: 'truck', id: tr.id, x: tr.x, z: tr.z });
  w.jobs = w.jobs.filter(j => j !== job);
  tr.job = null; tr.state = 'idle'; tr.idleHours = 0;
}

export function logisticsDaily(w: World) {
  // Driver wages flow to local labour.
  for (const tr of w.trucks) {
    const reg = regionOf(w, tr.home) === 'chandigarh' ? 'chandigarh' : 'moga';
    const wage = DRIVER_WAGE_PER_DAY * TRUCK_SCALE;
    payOwner(w, tr, -wage);
    w.labourPool[reg] += wage;
  }
  // Open-market rates float with the backlog of unassigned loads.
  const waiting = w.jobs.filter(j => j.takenBy == null).length;
  const idle = w.trucks.filter(t => t.state === 'idle').length;
  const pressure = waiting / Math.max(5, idle);
  const target = Math.max(0.8, Math.min(1.6, 0.85 + pressure * 0.15));
  w.freightSurge += (target - w.freightSurge) * 0.2;
  if (waiting > 120 && w.dayIndex % 7 === 0) w.event('warn', `${waiting} freight loads waiting for trucks; mandi lifting is backing up.`);
  if (w.dayOfMonth() === 1) for (const tr of w.trucks) { tr.kmMonth = 0; tr.earnMonth = 0; tr.fuelMonth = 0; tr.tollMonth = 0; }
}
