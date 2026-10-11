// Firms: cost of goods, restocking by truck, wages, pricing, lending, profits.
import { GOODS_SHARE, WAGE_SHARE, type Archetype, type Business, type Region } from './model';
import { postJob } from './logistics';
import type { World } from './world';

/** Firms whose sales are mainly to buyers outside the simulated households. */
const EXOGENOUS: Partial<Record<Archetype, (w: World, b: Business) => number>> = {
  it_services: () => 1,
  manufacturing: w => 0.85 + 0.15 * consumptionIndex(w),
  wholesale: w => 0.6 + 0.4 * consumptionIndex(w),
  hospitality: w => (w.month() >= 10 || w.month() <= 2 ? 1.15 : 0.9),
  cold_store: w => (w.month() >= 2 && w.month() <= 9 ? 1.2 : 0.6),
  flour_mill: () => 1,
  dairy: () => 1,
  repair: w => (w.month() === 4 || w.month() === 10 ? 1.4 : 0.9),
  other: () => 0.7,
  real_estate: w => 0.4 * w.policy.remittanceMult + 0.2,
  transporter: () => 0.25,     // non-simulated cargo (parcels, construction material)
  auto_dealer: w => 0.4 + (w.month() === 10 || w.month() === 11 ? 0.3 : 0),
};

let baselineConsumption = 0;
function consumptionIndex(w: World): number {
  const s = w.stats.series.consumption;
  if (s.length < 3) return 1;
  const recent = s.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, s.length);
  if (!baselineConsumption && s.length >= 14) baselineConsumption = recent;
  return baselineConsumption ? recent / baselineConsumption : 1;
}

const VALUE_PER_TONNE: Partial<Record<Archetype, number>> = {
  retail_grocery: 90000, retail_cloth: 400000, retail_electronics: 1500000, fuel: 95000, input_dealer: 30000,
  auto_dealer: 800000, food_service: 80000, health: 600000, real_estate: 8000, wholesale: 100000, manufacturing: 120000, ecommerce: 300000,
};

export function businessesDaily(w: World) {
  const fuelRetail = (r: Region) => w.businesses.find(b => b.archetype === 'fuel' && b.region === r);
  for (const b of w.businesses) {
    if (b.sector.id === 'nestle_moga') { b.revenueDay = 0; continue; }
    const exo = EXOGENOUS[b.archetype];
    if (exo && b.archetype !== 'dairy') {
      const rev = b.baseDailyRevenue * exo(w, b) * w.rng.range(0.85, 1.15);
      b.cash += rev; b.revenueDay += rev; b.revenueMonth += rev;
      w.transfer('external_sales', rev, null, w.bizAcct(b));
    } else if (b.archetype === 'dairy') {
      // Non-Nestlé collection centres earn a margin on village milk.
      const rev = b.baseDailyRevenue * (w.month() >= 11 || w.month() <= 3 ? 1.1 : 0.9);
      b.cash += rev; b.revenueDay += rev; b.revenueMonth += rev;
      w.transfer('external_sales', rev, null, w.bizAcct(b));
    }
    // Researched gross margin (when given) bounds goods cost, wages and overhead.
    const gm = b.sector.grossMarginPct != null && b.sector.grossMarginPct > 0 && b.sector.grossMarginPct < 100 ? b.sector.grossMarginPct / 100 : null;
    const goods = GOODS_SHARE[b.archetype] != null ? (gm != null ? 1 - gm : GOODS_SHARE[b.archetype]!) : 0;
    const cogs = b.revenueDay * goods;
    b.inventory -= cogs;
    const baseWage = WAGE_SHARE[b.archetype] ?? 0.1;
    const wageShare = goods > 0 ? Math.min(baseWage, (1 - goods) * 0.45) : baseWage;
    const wages = b.revenueDay * wageShare;
    b.cash -= wages;
    if (b.archetype !== 'it_services') w.labourPool[b.region] += wages;   // IT pays salaried agents directly
    if (wages > 0) w.transfer('labour_hire', wages, w.bizAcct(b), null);
    const overhead = b.revenueDay * (goods > 0 ? (1 - goods) * 0.25 : 0.06);
    b.cash -= overhead;
    b.costMonth += cogs + wages + overhead;
    // Farm-machinery & service businesses burn diesel too.
    if (b.archetype === 'repair' || b.archetype === 'real_estate') {
      const fr = fuelRetail(b.region);
      if (fr) { const d = b.revenueDay * 0.05; fr.cash += d; fr.revenueDay += d; fr.revenueMonth += d; b.cash -= d; }
    }
    if (goods > 0 && b.inventory < b.inventoryTarget * 0.45 && !b.restockPending) restock(w, b);
    b.customersDay = 0;
    b.revenueDay = 0;
    if (b.cash < -b.baseDailyRevenue * 30) {
      // Working-capital loan from a bank.
      const bank = w.businesses.find(x => x.archetype === 'finance' && x.region === b.region);
      const amt = -b.cash + b.baseDailyRevenue * 10;
      b.cash += amt; if (bank) bank.loanBook += amt;
      w.transfer('loan', amt, bank ? w.bizAcct(bank) : null, w.bizAcct(b));
    }
  }
}

function restock(w: World, b: Business) {
  const value = b.inventoryTarget - b.inventory;
  if (value <= 0) return;
  const vpt = VALUE_PER_TONNE[b.archetype] ?? 150000;
  const tonnes = value / vpt;
  b.restockPending = true;
  // Jewellery and high-value goods move by courier/car, not trucks.
  if (tonnes < 2 || b.archetype === 'jeweller') {
    b.inventory += value; b.restockPending = false; b.cash -= value;
    w.transfer('restock', value, w.bizAcct(b), w.placeAcct(b.supplierPlace));
    return;
  }
  b.cash -= value;
  w.transfer('restock', value, w.bizAcct(b), w.placeAcct(b.supplierPlace));
  const commodity = b.archetype === 'input_dealer' ? 'fertilizer' : b.archetype === 'fuel' ? 'other' : 'goods';
  // Big orders split into truck-agent loads.
  const loads = Math.max(1, Math.min(6, Math.round(tonnes / 200)));
  let delivered = 0;
  for (let i = 0; i < loads; i++) {
    const from = b.archetype === 'input_dealer' ? w.key.railhead : b.supplierPlace;
    postJob(w, {
      from, to: b.placeId, commodity, tonnes: tonnes / loads, payerKind: 'biz', payerId: b.id,
      onDeliver: () => { b.inventory += value / loads; if (++delivered === loads) b.restockPending = false; },
    });
  }
  w.note(b, 'restock', `Ordered ₹${Math.round(value / 1e5)}L of stock (${tonnes.toFixed(0)} t) from ${w.place(b.supplierPlace)?.name ?? b.supplierPlace}.`);
}

export function businessesMonthly(w: World) {
  w.profitPool = { moga: 0, chandigarh: 0 };
  const bankRate = w.policy.bankRatePct / 100 / 12, infRate = w.policy.informalRatePct / 100 / 12;
  let priceSum = 0, priceN = 0;
  for (const b of w.businesses) {
    // Lenders earn interest on their loan books.
    if (b.archetype === 'finance' && b.loanBook > 0) {
      const i = b.loanBook * bankRate; b.cash += i; b.revenueMonth += i;
    }
    if (b.archetype === 'arhtiya' && b.loanBook > 0) {
      const i = b.loanBook * infRate; b.revenueMonth += i; b.loanBook += i;
    }
    const profit = b.revenueMonth - b.costMonth;
    b.profitLastMonth = profit;
    b.revenueLastMonth = b.revenueMonth;
    b.history.push(b.revenueMonth); if (b.history.length > 36) b.history.shift();
    // Pricing: firms nudge prices toward demand.
    const expected = b.baseDailyRevenue * 30;
    const ratio = expected > 0 ? b.revenueMonth / expected : 1;
    const old = b.priceIndex;
    if (ratio > 1.15) b.priceIndex = Math.min(1.25, b.priceIndex + 0.01);
    else if (ratio < 0.8) b.priceIndex = Math.max(0.85, b.priceIndex - 0.01);
    if (b.priceIndex !== old && w.rng.chance(0.3)) w.note(b, 'price', `${b.priceIndex > old ? 'Raised' : 'Cut'} prices to ${b.priceIndex.toFixed(2)}× (demand ${(ratio * 100).toFixed(0)}% of normal).`);
    if (GOODS_SHARE[b.archetype]) { priceSum += b.priceIndex * b.weight; priceN += b.weight; }
    // Owners draw most profit; the rest is retained.
    if (b.sector.id !== 'nestle_moga' && b.archetype !== 'it_services') {
      const draw = Math.max(0, profit) * 0.7;
      b.cash -= draw;
      w.profitPool[b.region] += draw;
    }
    b.revenueMonth = 0; b.costMonth = 0;
  }
  const diesel = w.diesel();
  w.prices.cpi = (priceN ? priceSum / priceN : 1) * (1 + 0.08 * (diesel / 95.6 - 1));
  w.stats.rollMonth();
}
