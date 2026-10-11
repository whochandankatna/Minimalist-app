// Crops, mandis, procurement, milling, rail dispatch, dairy and stubble.
// Farmer choices are utility-based and shaped by each household's traits.
import type { Crop } from '../data/types';
import { dist, project } from '../geo/projection';
import type { Business, Household } from './model';
import { postJob } from './logistics';
import { clamp01, TRUCK_SCALE } from './constants';
import type { World } from './world';
import { borrow } from './households';

const CV_YIELD: Record<string, number> = { paddy: 0.08, wheat: 0.08, basmati: 0.12, maize: 0.2, potato: 0.25, mustard: 0.2, cotton: 0.3, sugarcane: 0.1 };
const CV_PRICE: Record<string, number> = { potato: 0.4, basmati: 0.2, maize: 0.18, mustard: 0.15, cotton: 0.2 };
const RAKE_T = 2600;            // one grain rake
const LIFT_JOB_T = 20 * TRUCK_SCALE;

const isPaddy = (id: string) => /paddy/.test(id);
const isKharif = (c: Crop) => /kharif/i.test(c.season);
const isRabi = (c: Crop) => /rabi/i.test(c.season);

function cropCost(c: Crop): number { return c.inputCostInrPerHa?.total ?? 45000; }
function cropYield(c: Crop): number { return c.yieldQtlPerHa ?? 40; }

/** Net INR/ha/year from the dominant paddy–wheat rotation, used to size farms from income. */
function rotationNet(w: World): number {
  const net = (id: string) => {
    const c = w.crops.get(id);
    if (!c) return 70000;
    return cropYield(c) * (w.msp(id) ?? w.prices[id]) - cropCost(c);
  };
  const paddyId = [...w.crops.keys()].find(isPaddy) ?? 'paddy';
  return Math.max(60000, net(paddyId) + net('wheat'));
}

function nearest(w: World, ids: string[], x: number, z: number): string {
  let best = ids[0], bd = Infinity;
  for (const id of ids) { const p = w.place(id)!; const d = dist(p, { x, z }); if (d < bd) { bd = d; best = id; } }
  return best;
}

export function initFarms(w: World) {
  const net = rotationNet(w);
  const kharifCrops = [...w.crops.values()].filter(isKharif);
  const areaWeight = (c: Crop) => c.mogaAreaHa ?? (isPaddy(c.id) ? 150000 : 5000);
  const arhtiyas = w.businesses.filter(b => b.archetype === 'arhtiya');
  const dairyShares = w.data.agriculture.dairy?.buyers ?? [];
  const nestleShare = dairyShares.find(b => /nestl/i.test(b.id + b.name));
  const nShare = (nestleShare?.shareOfMarketedMilkMoga ?? nestleShare?.share ?? 0.4);
  const lpd = w.data.agriculture.dairy?.milkLitresPerAnimalPerDay ?? {};
  const lpdVals = Object.values(lpd).filter((v): v is number => typeof v === 'number' && v > 1 && v < 40);
  const avgLpd = lpdVals.length ? lpdVals.reduce((a, b) => a + b, 0) / lpdVals.length : 9;
  const feed = w.data.agriculture.dairy?.feedCostInrPerAnimalPerDay ?? 200;
  const netPerAnimal = Math.max(20000, (avgLpd * w.prices.milk - feed) * 365);
  const credit = w.data.agriculture.credit ?? {};
  const avgDebt = credit.avgOutstandingDebtPerFarmHouseholdInr ?? 203000;
  const inst = credit.institutionalShare ?? 0.8;

  for (const h of w.households) {
    if (h.region !== 'moga') continue;
    const crops = h.profile.incomeSources.crops ?? 0;
    const dairy = h.profile.incomeSources.dairy ?? 0;
    if (crops < 0.1 && dairy < 0.1) continue;
    const villageId = w.place(h.placeId)?.type === 'village_cluster' ? h.placeId : nearest(w, w.key.villages, h.x, h.z);
    const v = w.place(villageId)!;
    const ha = crops >= 0.1 ? Math.min(40, Math.max(0.3, (h.expectedIncome * 12 * crops) / net)) : 0;
    const k = ha > 0 ? w.rng.weighted(kharifCrops, areaWeight) : null;
    let harvestDay = 0, crop: string | null = null;
    if (k && k.harvestMonth >= 10) {
      crop = k.id;
      harvestDay = isPaddy(k.id) ? w.rng.range(0, 40) : w.rng.range(10, 50);
    }
    const animals = dairy >= 0.05 ? Math.max(1, Math.round((h.expectedIncome * 12 * dairy) / netPerAnimal)) : 0;
    h.farm = {
      ha, villageId, mandiId: nearest(w, w.key.mandis, v.x, v.z), crop, sownDay: -110, harvestDay,
      stock: null, lastKharif: k?.id ?? 'paddy', lastRabi: 'wheat',
      animals, milkLpd: avgLpd * w.rng.range(0.8, 1.2),
      dairyBuyer: w.rng.chance(nShare) ? 'nestle' : w.key.dairyAlt && w.rng.chance(0.5) ? 'verka' : 'local',
      stubble: 'none',
    };
    if (ha > 0) {
      const local = arhtiyas.filter(a => a.placeId === h.farm!.mandiId);
      h.arhtiyaId = (local.length ? w.rng.pick(local) : arhtiyas.length ? w.rng.pick(arhtiyas) : null)?.id ?? null;
      const debt = w.rng.lognormal(avgDebt * Math.sqrt(Math.max(0.3, ha) / 3), 0.5) * (0.6 + h.traits.creditAppetite * 0.8);
      h.debtBank = debt * inst; h.debtArhtiya = debt * (1 - inst);
      if (k) w.ag.area.kharif[k.id] = (w.ag.area.kharif[k.id] ?? 0) + ha * h.weight;
    }
  }
  w.ag.share.kharif = shares(w.ag.area.kharif);
  w.ag.share.rabi = { wheat: 0.95, potato: 0.02, mustard: 0.01 };
  w.env.paddyShare = Object.entries(w.ag.share.kharif).filter(([id]) => isPaddy(id)).reduce((a, [, v]) => a + v, 0);
}

function shares(area: Record<string, number>): Record<string, number> {
  const tot = Object.values(area).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(area).map(([k, v]) => [k, v / tot]));
}

// ------------------------------------------------------------------ crop choice
interface Option { crop: Crop; u: number; mean: number; sd: number; assured: boolean }

export function chooseCrop(w: World, h: Household, season: 'kharif' | 'rabi'): { crop: Crop; text: string } | null {
  const f = h.farm!;
  const cands = [...w.crops.values()].filter(c => (season === 'kharif' ? isKharif(c) : isRabi(c)) && c.yieldQtlPerHa);
  if (!cands.length) return null;
  const t = h.traits;
  const last = season === 'kharif' ? f.lastKharif : f.lastRabi;
  const neigh = w.ag.share[season];
  const opts: Option[] = cands.map(c => {
    const assured = w.procured(c.id);
    const y = cropYield(c) * (season === 'kharif' ? w.policy.monsoon : 1);
    const p = assured ? w.msp(c.id)! : w.prices[c.id];
    const cvY = CV_YIELD[c.id] ?? 0.15, cvP = assured ? 0.02 : CV_PRICE[c.id] ?? 0.15;
    let cost = cropCost(c);
    if (season === 'kharif' && !isPaddy(c.id)) cost -= w.policy.diversificationIncentivePerHa;
    const mean = p * y - cost;
    const sd = p * y * Math.sqrt(cvY * cvY + cvP * cvP);
    return { crop: c, u: 0, mean, sd, assured };
  });
  const scale = Math.max(...opts.map(o => Math.abs(o.mean)), 1);
  for (const o of opts) {
    const riskPenalty = t.riskAversion * (t.lossAversion / 2) * 1.1 * o.sd;
    const herd = t.socialConformity * (neigh[o.crop.id] ?? 0) * 0.3 * scale;
    const habit = o.crop.id === last ? t.brandLoyalty * 0.08 * scale : 0;
    const capital = cropCost(o.crop) > 90000 && h.cash < cropCost(o.crop) * f.ha * 0.5 ? (1 - t.creditAppetite) * 0.3 * scale : 0;
    o.u = o.mean - riskPenalty + herd + habit - capital;
  }
  const T = 0.06 * scale;
  const maxU = Math.max(...opts.map(o => o.u));
  const pick = w.rng.weighted(opts, o => Math.exp((o.u - maxU) / T));
  const alt = opts.filter(o => o !== pick).sort((a, b) => b.u - a.u)[0];
  const fmt = (n: number) => `₹${Math.round(n / 1000)}k`;
  let text = `Chose ${pick.crop.name} on ${f.ha.toFixed(1)} ha: expected net ${fmt(pick.mean)}/ha${pick.assured ? ' (MSP-assured)' : ''}`;
  if (alt) text += `; ${alt.crop.name} offered ${fmt(alt.mean)}/ha but ${alt.u < pick.u ? (alt.sd > pick.sd ? 'felt riskier' : 'fewer neighbours grow it') : 'lost the coin-flip'}`;
  text += `. Risk aversion ${t.riskAversion.toFixed(2)}, conformity ${t.socialConformity.toFixed(2)}.`;
  return { crop: pick.crop, text };
}

// ------------------------------------------------------------------ daily
export function farmingDaily(w: World) {
  const m = w.month(), dom = w.dayOfMonth(), day = w.dayIndex;
  w.ag.arrivalsToday = {};
  w.env.burnsToday = 0;
  if (m === 6 && dom === 1) { w.ag.area.kharif = {}; }
  if (m === 10 && dom === 20) { w.ag.area.rabi = {}; }
  const commission = w.commissionPct() / 100;
  const payDays = w.data.agriculture.mandiSystem?.paymentDaysTypical ?? 3;
  const labourShare = 0.22;
  const arhtiyaById = new Map(w.businesses.filter(b => b.archetype === 'arhtiya').map(b => [b.id, b]));
  const inputDealers = w.businesses.filter(b => b.archetype === 'input_dealer' && b.region === 'moga');
  const nestle = w.businesses.find(b => b.sector.id === 'nestle_moga')!;
  const milkSeason = m >= 11 || m <= 3 ? 1.12 : m >= 5 && m <= 8 ? 0.88 : 1;
  w.ag.nestleMilkToday = 0;

  for (const h of w.households) {
    const f = h.farm;
    if (!f) continue;
    // ---- sowing
    if (f.ha > 0 && !f.crop && !f.stock) {
      const kharifWindow = (m === 6) || (m === 5 && dom > 25) || (m === 7 && dom < 10);
      const rabiWindow = (m === 10 && dom > 20) || m === 11 || (m === 12 && dom < 15);
      const season = kharifWindow ? 'kharif' : rabiWindow && f.stubble !== 'standing' ? 'rabi' : null;
      const sownThisSeason = day - f.sownDay < 100;
      if (season && !sownThisSeason && w.rng.chance(0.12)) {
        const choice = chooseCrop(w, h, season);
        if (choice) sow(w, h, choice.crop, season, choice.text, inputDealers, labourShare);
      }
    }
    // ---- harvest
    if (f.crop && day >= f.harvestDay) {
      const c = w.crops.get(f.crop)!;
      const weather = isKharif(c) ? w.policy.monsoon : 1;
      const qtl = f.ha * cropYield(c) * weather * w.rng.range(0.9, 1.08);
      f.stock = { crop: c.id, qtl, heldSince: day };
      if (isPaddy(c.id) || c.id === 'basmati') f.stubble = 'standing';
      if (isKharif(c)) f.lastKharif = c.id; else f.lastRabi = c.id;
      f.crop = null;
      const harvestWages = f.ha * cropCost(c) * 0.08 * h.weight;
      payFromHh(w, h, harvestWages / h.weight, 'labour_hire');
      w.labourPool.moga += harvestWages;
    }
    // ---- stubble
    if (f.stubble === 'standing' && f.stock == null || (f.stubble === 'standing' && day - (f.stock?.heldSince ?? day) > 2)) {
      if (w.rng.chance(0.25)) decideStubble(w, h);
    }
    // ---- sell
    if (f.stock) sellStock(w, h, arhtiyaById, commission, payDays);
    // ---- dairy
    if (f.animals > 0) {
      const litres = f.animals * f.milkLpd * milkSeason;
      const price = w.prices.milk * (f.dairyBuyer === 'local' ? 0.92 : 1);
      const amount = litres * price * h.weight;
      h.cash += litres * price; h.incomeMonth += litres * price;
      if (f.dairyBuyer === 'nestle') {
        nestle.cash -= amount; nestle.costMonth += amount;
        w.ag.nestleMilkToday += litres * h.weight;
        w.milkPending.set(f.villageId, (w.milkPending.get(f.villageId) ?? 0) + litres * h.weight);
        w.transfer('milk_sale', amount, w.bizAcct(nestle), w.hhAcct(h));
      } else {
        w.transfer('milk_sale', amount, w.placeAcct(f.dairyBuyer === 'verka' && w.key.dairyAlt ? w.key.dairyAlt : f.villageId), w.hhAcct(h));
      }
      const feed = (w.data.agriculture.dairy?.feedCostInrPerAnimalPerDay ?? 200) * f.animals;
      payFromHh(w, h, feed, 'inputs', inputDealers.length ? w.rng.pick(inputDealers) : undefined);
    }
  }

  // State pays MSP proceeds after the payment lag (direct benefit transfer).
  const due = w.gov.pendingPayments.filter(p => p.day <= day);
  if (due.length) {
    w.gov.pendingPayments = w.gov.pendingPayments.filter(p => p.day > day);
    const byId = new Map(w.households.map(h => [h.id, h]));
    for (const p of due) {
      const h = byId.get(p.hh);
      if (!h) continue;
      h.cash += p.amount; h.incomeMonth += p.amount;
      w.transfer('crop_sale', p.amount * h.weight, w.placeAcct(h.farm?.mandiId ?? 'moga', 'gov'), w.hhAcct(h));
      repayArhtiya(w, h, p.amount, arhtiyaById);
    }
  }

  updatePrices(w);
  liftMandis(w);
  millPaddy(w);
  dispatchRakes(w);
  milkCollection(w, nestle);
  updateEnvironment(w);
}

function sow(w: World, h: Household, c: Crop, season: 'kharif' | 'rabi', text: string, dealers: Business[], labourShare: number) {
  const f = h.farm!;
  f.crop = c.id; f.sownDay = w.dayIndex;
  f.harvestDay = w.dayIndex + (c.growDays ?? 120) * w.rng.range(0.95, 1.05);
  w.ag.area[season][c.id] = (w.ag.area[season][c.id] ?? 0) + f.ha * h.weight;
  w.ag.share[season] = shares(w.ag.area[season]);
  if (season === 'kharif') {
    w.env.paddyShare = Object.entries(w.ag.share.kharif).filter(([id]) => isPaddy(id)).reduce((a, [, v]) => a + v, 0);
    if (!isPaddy(c.id) && w.policy.diversificationIncentivePerHa > 0) {
      const sub = w.policy.diversificationIncentivePerHa * f.ha;
      h.cash += sub; w.gov.subsidiesPaid += sub * h.weight;
      w.transfer('subsidy', sub * h.weight, w.placeAcct('moga', 'gov'), w.hhAcct(h));
    }
  }
  const cost = cropCost(c) * f.ha * 0.75; // remaining 25% falls at harvest (combine, transport)
  if (h.cash < cost) borrow(w, h, cost - h.cash + 5000, 'crop inputs');
  const labour = cost * labourShare;
  const diesel = cost * 0.15;
  const inputs = cost - labour - diesel;
  payFromHh(w, h, inputs, 'inputs', dealers.length ? w.rng.pick(dealers) : undefined);
  payFromHh(w, h, labour, 'labour_hire');
  w.labourPool.moga += labour * h.weight;
  const fuel = w.businesses.find(b => b.archetype === 'fuel' && b.region === 'moga');
  payFromHh(w, h, diesel, 'fuel', fuel);
  w.note(h, 'crop', text);
}

/** Household pays per-household `amount`; aggregate goes to biz (or out of region). */
export function payFromHh(w: World, h: Household, amount: number, kind: string, biz?: Business) {
  if (!(amount > 0)) return;
  h.cash -= amount;
  const agg = amount * h.weight;
  if (biz) {
    biz.cash += agg; biz.revenueDay += agg; biz.revenueMonth += agg;
    w.transfer(kind, agg, w.hhAcct(h), w.bizAcct(biz));
  } else {
    w.transfer(kind, agg, w.hhAcct(h), null);
  }
}

function procurementWindow(w: World, cropId: string): boolean {
  const m = w.month();
  if (isPaddy(cropId)) return m === 10 || m === 11 || (m === 12 && w.dayOfMonth() < 15);
  if (cropId === 'wheat') return m === 4 || m === 5;
  if (cropId === 'maize') return m >= 8 && m <= 10;
  return true;
}

function sellStock(w: World, h: Household, arhtiyas: Map<number, Business>, commission: number, payDays: number) {
  const f = h.farm!, s = f.stock!;
  const t = h.traits;
  const msp = w.msp(s.crop);
  const assured = w.procured(s.crop) && procurementWindow(w, s.crop);
  const held = w.dayIndex - s.heldSince;
  const arhtiya = h.arhtiyaId != null ? arhtiyas.get(h.arhtiyaId) : undefined;
  const mandiLoad = Object.values(w.mandiStock.get(f.mandiId) ?? {}).reduce((a, b) => a + b, 0);

  if (assured && msp) {
    // Glut or moisture rejection forces waits; impatient or indebted farmers sell below MSP privately.
    const congestion = Math.min(0.8, mandiLoad / 6000);
    if (w.rng.chance(congestion * 0.6) && held < 12) {
      const urgency = t.timePreference * 0.6 + (h.cash < 0 ? 0.3 : 0) + (h.debtArhtiya > 200000 ? 0.1 : 0);
      if (w.rng.chance(urgency * 0.25)) {
        const price = msp * w.rng.range(0.86, 0.94);
        sellPrivate(w, h, price, arhtiya, `Distress sale of ${Math.round(s.qtl)} qtl ${s.crop} at ₹${Math.round(price)}/qtl (MSP ₹${Math.round(msp)}): mandi glut, could not wait (time preference ${t.timePreference.toFixed(2)}).`);
      }
      return;
    }
    const value = s.qtl * msp;
    w.gov.pendingPayments.push({ day: w.dayIndex + payDays, hh: h.id, amount: value });
    w.gov.procurementSpend += value * h.weight;
    w.gov.procuredT[s.crop] = (w.gov.procuredT[s.crop] ?? 0) + (s.qtl * h.weight) / 10;
    w.transfer('procurement', value * h.weight, w.placeAcct('moga', 'gov'), w.placeAcct(f.mandiId));
    if (arhtiya) {
      const comm = value * commission * h.weight;
      arhtiya.cash += comm; arhtiya.revenueDay += comm; arhtiya.revenueMonth += comm;
      w.transfer('commission', comm, w.placeAcct('moga', 'gov'), w.bizAcct(arhtiya));
    }
    addMandi(w, f.mandiId, s.crop, (s.qtl * h.weight) / 10);
    w.ag.arrivalsToday[s.crop] = (w.ag.arrivalsToday[s.crop] ?? 0) + s.qtl * h.weight;
    w.note(h, 'sale', `Sold ${Math.round(s.qtl)} qtl ${s.crop} at MSP ₹${Math.round(msp)} via arhtiya; payment due in ${payDays} days.`);
    f.stock = null;
    return;
  }

  // Private market: patient farmers hold for a seasonal price recovery if they can afford to.
  const price = w.prices[s.crop];
  const base = baselinePrice(w, s.crop);
  const expectedGain = (base - price) / base;
  const canWait = h.cash > h.expectedIncome * 0.5 && held < 75 && !/potato/.test(s.crop) || (s.crop === 'potato' && held < 40);
  if (canWait && expectedGain > 0.03 * (1 + t.timePreference * 2) && w.rng.chance(0.9)) return;
  if (w.rng.chance(0.35 + t.timePreference * 0.3)) {
    sellPrivate(w, h, price, arhtiya, `Sold ${Math.round(s.qtl)} qtl ${s.crop} on the open market at ₹${Math.round(price)}/qtl after holding ${held} days.`);
  }
}

function sellPrivate(w: World, h: Household, price: number, arhtiya: Business | undefined, text: string) {
  const f = h.farm!, s = f.stock!;
  const value = s.qtl * price;
  const buyers = w.businesses.filter(b => (s.crop === 'wheat' ? b.archetype === 'flour_mill' : /paddy|basmati/.test(s.crop) ? b.archetype === 'rice_mill' : b.archetype === 'cold_store') && b.region === 'moga');
  const buyer = buyers.length ? w.rng.pick(buyers) : undefined;
  if (buyer) {
    buyer.cash -= value * h.weight; buyer.grainQtl += s.qtl * h.weight; buyer.costMonth += value * h.weight;
    if (/paddy|basmati/.test(s.crop)) w.ag.millRiceT.set(buyer.id, w.ag.millRiceT.get(buyer.id) ?? 0);
  }
  h.cash += value; h.incomeMonth += value;
  w.transfer('crop_sale', value * h.weight, buyer ? w.bizAcct(buyer) : w.placeAcct(f.mandiId), w.hhAcct(h));
  if (arhtiya) {
    const comm = value * w.commissionPct() / 100 * h.weight;
    arhtiya.cash += comm; arhtiya.revenueDay += comm; arhtiya.revenueMonth += comm;
    w.transfer('commission', comm, buyer ? w.bizAcct(buyer) : null, w.bizAcct(arhtiya));
  }
  w.ag.arrivalsToday[s.crop] = (w.ag.arrivalsToday[s.crop] ?? 0) + s.qtl * h.weight;
  w.note(h, 'sale', text);
  repayArhtiya(w, h, value, new Map(arhtiya ? [[arhtiya.id, arhtiya]] : []));
  f.stock = null;
}

/** Interlinked credit: the arhtiya recovers part of the loan from crop proceeds. */
function repayArhtiya(w: World, h: Household, proceeds: number, arhtiyas: Map<number, Business>) {
  if (h.debtArhtiya <= 0) return;
  const frac = 0.3 + 0.4 * h.traits.socialConformity;
  const pay = Math.min(h.debtArhtiya, proceeds * frac, Math.max(0, h.cash));
  if (pay <= 0) return;
  h.debtArhtiya -= pay; h.cash -= pay;
  const a = h.arhtiyaId != null ? arhtiyas.get(h.arhtiyaId) : undefined;
  if (a) { a.cash += pay * h.weight; a.loanBook = Math.max(0, a.loanBook - pay * h.weight); }
  w.transfer('repayment', pay * h.weight, w.hhAcct(h), a ? w.bizAcct(a) : null);
}

function addMandi(w: World, mandi: string, crop: string, tonnes: number) {
  const s = w.mandiStock.get(mandi) ?? {};
  s[crop] = (s[crop] ?? 0) + tonnes;
  w.mandiStock.set(mandi, s);
}

function baselinePrice(w: World, crop: string): number {
  const c = w.crops.get(crop);
  return c?.privatePriceInrPerQtl ?? (w.msp(crop) ?? 2000) * 0.97;
}

function updatePrices(w: World) {
  for (const c of w.crops.values()) {
    const base = baselinePrice(w, c.id);
    const area = (w.ag.area.kharif[c.id] ?? 0) + (w.ag.area.rabi[c.id] ?? 0);
    const expectedDaily = Math.max(1, area * cropYield(c)) / 45;
    const arrivals = w.ag.arrivalsToday[c.id] ?? 0;
    const glut = Math.min(0.25, (arrivals / expectedDaily - 1) * 0.04);
    let target = base * (1 - Math.max(-0.08, glut));
    const msp = w.msp(c.id);
    if (msp && w.procured(c.id) && procurementWindow(w, c.id)) target = Math.max(target, msp * 0.96);
    w.prices[c.id] += (target - w.prices[c.id]) * 0.08 + w.rng.normal(0, base * 0.004);
  }
  const m = w.month();
  const flush = m >= 11 || m <= 3 ? 0.97 : m >= 5 && m <= 8 ? 1.04 : 1;
  w.prices.milk += (w.milkPriceBase() * flush - w.prices.milk) * 0.05;
}

function liftMandis(w: World) {
  const mills = w.businesses.filter(b => b.archetype === 'rice_mill' && b.region === 'moga');
  // Daily lifting contracts per mandi (tonnes), scaled by policy.
  const capacity = 3500 * w.policy.liftingCapacityMult;
  for (const [mandi, stock] of w.mandiStock) {
    let budget = capacity;
    for (const crop of Object.keys(stock)) {
      while (stock[crop] >= LIFT_JOB_T * 0.5 && budget > 0) {
        const t = Math.min(LIFT_JOB_T, stock[crop]);
        stock[crop] -= t; budget -= t;
        if (isPaddy(crop) && mills.length) {
          const mill = w.rng.pick(mills);
          postJob(w, { from: mandi, to: mill.placeId, commodity: 'paddy', tonnes: t, payerKind: 'gov', payerId: 0,
            onDeliver: () => { mill.grainQtl += t * 10; } });
        } else {
          postJob(w, { from: mandi, to: w.key.godown, commodity: crop === 'wheat' ? 'wheat' : 'other', tonnes: t, payerKind: 'gov', payerId: 0,
            onDeliver: () => { w.godownStock.wheat += t; } });
        }
      }
    }
  }
}

function millPaddy(w: World) {
  for (const b of w.businesses) {
    if (b.archetype !== 'rice_mill' || b.grainQtl <= 0) continue;
    const qtl = Math.min(b.grainQtl, b.weight * 250);   // ~25 t paddy/day per mill
    b.grainQtl -= qtl;
    const rice = (qtl / 10) * 0.67;
    const fee = qtl * 110;                               // milling charges + by-products (bran, husk), INR/qtl
    b.cash += fee; b.revenueDay += fee; b.revenueMonth += fee;
    w.transfer('milling', fee, w.placeAcct('moga', 'gov'), w.bizAcct(b));
    const acc = (w.ag.millRiceT.get(b.id) ?? 0) + rice;
    if (acc >= LIFT_JOB_T) {
      w.ag.millRiceT.set(b.id, acc - LIFT_JOB_T);
      postJob(w, { from: b.placeId, to: w.key.godown, commodity: 'rice', tonnes: LIFT_JOB_T, payerKind: 'gov', payerId: 0,
        onDeliver: () => { w.godownStock.rice += LIFT_JOB_T; } });
    } else w.ag.millRiceT.set(b.id, acc);
  }
}

function dispatchRakes(w: World) {
  const stock = w.godownStock.wheat + w.godownStock.rice;
  if (!w.ag.rakeLoading && stock >= RAKE_T) {
    w.ag.rakeLoading = true;
    const fromRice = Math.min(w.godownStock.rice, RAKE_T);
    w.godownStock.rice -= fromRice;
    w.godownStock.wheat -= RAKE_T - fromRice;
    const n = Math.ceil(RAKE_T / LIFT_JOB_T);
    for (let i = 0; i < n; i++) {
      postJob(w, { from: w.key.godown, to: w.key.railhead, commodity: fromRice > RAKE_T / 2 ? 'rice' : 'wheat', tonnes: RAKE_T / n, payerKind: 'gov', payerId: 0,
        onDeliver: () => { w.ag.railheadT += RAKE_T / n; } });
    }
  }
  if (w.ag.railheadT >= RAKE_T - 1) {
    w.ag.railheadT -= RAKE_T; w.ag.rakeLoading = false; w.ag.rakesDispatched++;
    const r = w.roads.route(w.key.railhead, w.key.railTo);
    const railRoute = railPath(w) ?? r;
    if (railRoute) w.trains.push({ route: railRoute, d: 0, tonnes: RAKE_T, commodity: 'rice' });
    if (w.ag.rakesDispatched % 5 === 1) w.event('market', `Grain rake #${w.ag.rakesDispatched} (${RAKE_T} t) leaves Moga for the central pool.`);
  }
}

function railPath(w: World) {
  const rails = w.data.geography.railways ?? [];
  const rp = w.place(w.key.railhead);
  if (!rp || !rails.length) return null;
  // Use the railway polyline closest to the railhead, run towards Ludhiana.
  let best = rails[0], bd = Infinity;
  for (const r of rails) for (const [lat, lon] of r.waypoints) {
    const p = w.place('moga'); if (!p) continue;
    const d = Math.hypot(lat - (p.lat), lon - p.lon);
    if (d < bd) { bd = d; best = r; }
  }
  const pts = best.waypoints.map(([lat, lon]) => project(lat, lon));
  // Orient so the train heads away from the railhead end that is closest.
  const d0 = Math.hypot(pts[0].x - rp.x, pts[0].z - rp.z);
  const d1 = Math.hypot(pts[pts.length - 1].x - rp.x, pts[pts.length - 1].z - rp.z);
  if (d1 < d0) pts.reverse();
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { points: pts, cum, km: cum[cum.length - 1], hours: cum[cum.length - 1] / 40, tolls: [], highways: [best.id] };
}

function milkCollection(w: World, nestle: Business) {
  const tankerL = 10000 * TRUCK_SCALE;
  for (const [village, litres] of w.milkPending) {
    if (litres < tankerL) continue;
    w.milkPending.set(village, litres - tankerL);
    postJob(w, { from: village, to: w.key.nestle, commodity: 'milk', tonnes: tankerL / 1000, payerKind: 'biz', payerId: nestle.id });
  }
  // Nestlé sells processed products nationally; ships a share by road to the tricity and Ludhiana.
  const sales = w.ag.nestleMilkToday * w.prices.milk * 1.75;
  nestle.cash += sales; nestle.revenueDay += sales; nestle.revenueMonth += sales;
  w.transfer('export', sales, null, w.bizAcct(nestle));
  if (w.dayIndex % 2 === 0) {
    postJob(w, { from: w.key.nestle, to: w.rng.chance(0.5) ? w.key.tricityHub : w.key.mogaHub, commodity: 'fmcg', tonnes: 15 * TRUCK_SCALE, payerKind: 'biz', payerId: nestle.id });
  }
}

function decideStubble(w: World, h: Household) {
  const f = h.farm!, t = h.traits, p = w.policy;
  const manageCost = 6200 - p.stubbleSubsidyPerHa;                  // in-situ machine rental per ha
  const expectedFine = p.stubbleFinePerHa * p.stubbleEnforcement * (t.lossAversion / 2);
  const urgency = w.month() >= 11 ? 1.4 : 1;                          // wheat sowing deadline pressure
  const neighbourBurn = Math.min(1, w.env.burnHaSeason / Math.max(1, (w.ag.area.kharif.paddy ?? 1) * 0.3));
  const burnPull = manageCost * (0.5 + t.timePreference * 0.6) * urgency * (1 + t.socialConformity * neighbourBurn * 0.4);
  const burnPush = expectedFine + t.trustInInstitutions * 2500 + (p.stubbleSubsidyPerHa > 0 ? p.stubbleSubsidyPerHa * 0.5 : 0);
  const burn = burnPull + w.rng.normal(0, 1500) > burnPush;
  if (burn) {
    f.stubble = 'burned';
    f.burnDay = w.t;
    w.env.burnsToday += h.weight;
    w.env.burnHaSeason += f.ha * h.weight;
    w.env.burnHaRecent.push(f.ha * h.weight);
    if (w.rng.chance(p.stubbleEnforcement)) {
      const fine = p.stubbleFinePerHa * f.ha;
      h.cash -= fine; w.gov.finesCollected += fine * h.weight;
      w.transfer('stubble_fine', fine * h.weight, w.hhAcct(h), w.placeAcct('moga', 'gov'));
      w.note(h, 'stubble', `Burned stubble on ${f.ha.toFixed(1)} ha and was fined ₹${Math.round(fine)}.`);
    } else {
      w.note(h, 'stubble', `Burned stubble to sow wheat on time (machine rent ₹${Math.round(manageCost)}/ha felt too high).`);
    }
  } else {
    f.stubble = 'managed';
    const cost = Math.max(0, manageCost) * f.ha;
    const fuel = w.businesses.find(b => b.archetype === 'fuel' && b.region === 'moga');
    payFromHh(w, h, cost, 'fuel', fuel);
    if (p.stubbleSubsidyPerHa > 0) {
      const sub = p.stubbleSubsidyPerHa * f.ha;
      h.cash += sub; w.gov.subsidiesPaid += sub * h.weight;
      w.transfer('subsidy', sub * h.weight, w.placeAcct('moga', 'gov'), w.hhAcct(h));
    }
    w.note(h, 'stubble', `Managed stubble in-situ (cost ₹${Math.round(cost)}); fine risk and trust in rules outweighed the hassle.`);
  }
}

function updateEnvironment(w: World) {
  const recent = w.env.burnHaRecent;
  w.env.burnHaRecent = recent.length > 400 ? recent.slice(-400) : recent;
  const m = w.month();
  // Daily ring-buffer of burned hectares; use a decaying sum as the smoke load.
  const smoke = w.env.burnsToday;
  const winter = m === 11 || m === 12 || m === 1 ? 70 : m === 10 || m === 2 ? 30 : 0;
  const target = 55 + winter + Math.min(300, smoke * 0.03);
  w.env.aqi += (target - w.env.aqi) * 0.25;
  if (m === 6 && w.dayOfMonth() === 1) w.env.burnHaSeason = 0;
  if (m === 10 && w.dayOfMonth() === 1 && w.dayIndex > 0) {
    // Annual groundwater change driven by paddy share (paddy ~2x wheat's water draw).
    const drop = 0.2 + 1.1 * Math.max(0, w.env.paddyShare - 0.4);
    w.env.groundwaterDepthM += drop;
    w.event('warn', `Groundwater table fell ${drop.toFixed(2)} m this year (paddy share ${(w.env.paddyShare * 100).toFixed(0)}%). Depth ${w.env.groundwaterDepthM.toFixed(1)} m.`);
  }
  w.env.paddyShare = clamp01(w.env.paddyShare);
}
