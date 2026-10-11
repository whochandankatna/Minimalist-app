// Household behaviour: earning, spending, borrowing, migrating, marrying.
// Every choice reads the agent's psychographic traits.
import type { ConsumptionCategory } from '../data/types';
import { CATEGORY_SHOPS, type Archetype, type Business, type Household, type Region } from './model';
import { clamp01 } from './constants';
import type { World } from './world';

const CATS = Object.keys(CATEGORY_SHOPS) as ConsumptionCategory[];
const ECOM_CATS = new Set<ConsumptionCategory>(['clothing', 'durables', 'food', 'other']);

let shopIndex: Map<string, Business[]> | null = null;
let shopIndexSize = -1;
function shops(w: World, region: Region, arch: Archetype): Business[] {
  if (!shopIndex || shopIndexSize !== w.businesses.length) {
    shopIndex = new Map();
    for (const b of w.businesses) {
      const k = `${b.region}|${b.archetype}`;
      const a = shopIndex.get(k) ?? [];
      a.push(b); shopIndex.set(k, a);
    }
    shopIndexSize = w.businesses.length;
  }
  return shopIndex.get(`${region}|${arch}`) ?? [];
}

function seasonal(w: World, cat: ConsumptionCategory): number {
  const m = w.month();
  const festive = m === 10 || m === 11;                // Dussehra / Diwali / Gurpurab
  if (festive && (cat === 'durables' || cat === 'clothing')) return 1.5;
  if (festive && cat === 'food') return 1.12;
  if (cat === 'education' && (m === 4 || m === 7)) return 1.6;   // admissions
  return 1;
}

/** Pick a store: loyal customers return; others compare a few on price and distance. */
function chooseShop(w: World, h: Household, arch: Archetype): Business | null {
  const list = shops(w, h.region, arch);
  if (!list.length) return null;
  const t = h.traits;
  const loyal = h.loyalty[arch];
  if (loyal != null && w.rng.chance(0.4 + t.brandLoyalty * 0.55)) {
    const b = list.find(x => x.id === loyal);
    if (b) return b;
  }
  let best: Business | null = null, bs = Infinity;
  for (let i = 0; i < 3; i++) {
    const b = w.rng.pick(list);
    const km = Math.hypot(b.x - h.x, b.z - h.z);
    const score = b.priceIndex * (0.5 + t.priceSensitivity) + km * 0.02 * (1.2 - t.digitalAdoption * 0.4) + w.rng.next() * 0.05;
    if (score < bs) { bs = score; best = b; }
  }
  if (best) h.loyalty[arch] = best.id;
  return best;
}

function payMethod(w: World, h: Household): string {
  const mix = h.profile.paymentMix;
  const digital = Math.min(0.9, (mix.upi ?? 0) + w.policy.upiPush * h.traits.digitalAdoption);
  const r = w.rng.next();
  if (r < (mix.udhaar_credit ?? 0)) return 'udhaar';
  if (r < (mix.udhaar_credit ?? 0) + digital) return 'upi';
  return 'cash';
}

export function householdsDaily(w: World) {
  const empl = w.labourDemandIndex;
  for (const h of w.households) {
    const t = h.traits;
    // ---- wages (daily labour market)
    if (h.wageIncomeExpected > 0) {
      const seasonalWork = h.region === 'moga' && (w.month() === 10 || w.month() === 11 || w.month() === 4 || w.month() === 6) ? 1.25 : 1;
      const wage = (h.wageIncomeExpected / 30) * empl[h.region] * seasonalWork;
      h.cash += wage; h.incomeMonth += wage;
      w.labourPool[h.region] -= wage * h.weight;
      w.transfer('wages', wage * h.weight, null, w.hhAcct(h));
    }

    // ---- consumption
    const s = h.profile.savingsRate ?? 0.1;
    const permanent = 0.6 * h.expectedIncome + 0.4 * h.incomeLastMonth;
    const mood = 0.8 + 0.4 * h.sentiment;
    let budget = (permanent * (1 - s) / 30) * mood * (1 / Math.max(0.8, w.prices.cpi));
    // Cash-strapped households cut back, more so if price-sensitive and averse to credit.
    if (h.cash < 0) budget *= 1 - 0.35 * t.priceSensitivity * (1 - t.creditAppetite * 0.5);

    const shares = h.profile.consumptionShares;
    let spent = 0;
    for (const cat of CATS) {
      const share = shares[cat] ?? 0;
      if (share <= 0) continue;
      let amount = budget * share * seasonal(w, cat);
      if (cat === 'ceremonies') amount *= 0.4;          // lumpy weddings handled separately
      if (amount < 1) continue;
      // Online share leaks out of the region except for local delivery margins.
      const online = ECOM_CATS.has(cat) && (h.profile.shopsAt ?? []).some(x => /ecommerce|quick/.test(x))
        ? Math.min(0.5, t.digitalAdoption * 0.22 + w.policy.upiPush * 0.1) : 0;
      if (online > 0) {
        const o = amount * online;
        h.cash -= o; spent += o;
        w.transfer('leakage', o * h.weight * 0.8, w.hhAcct(h), null);
        const local = shops(w, h.region, 'ecommerce')[0];
        if (local) { local.cash += o * h.weight * 0.2; local.revenueDay += o * h.weight * 0.2; local.revenueMonth += o * h.weight * 0.2; }
        amount -= o;
      }
      const arch = CATEGORY_SHOPS[cat].find(a => shops(w, h.region, a).length) ?? null;
      const shop = arch ? chooseShop(w, h, arch) : null;
      const agg = amount * h.weight;
      if (!shop) {
        h.cash -= amount; spent += amount;
        w.transfer('leakage', agg, w.hhAcct(h), null);
        continue;
      }
      const method = payMethod(w, h);
      if (method === 'udhaar' && (shop.archetype === 'retail_grocery' || shop.archetype === 'input_dealer' || shop.archetype === 'retail_cloth')) {
        h.udhaar += amount; shop.receivables += agg;
      } else {
        h.cash -= amount; shop.cash += agg;
      }
      spent += amount;
      shop.revenueDay += agg; shop.revenueMonth += agg; shop.customersDay += h.weight;
      w.transfer('consumption', agg, w.hhAcct(h), w.bizAcct(shop));
      if (method === 'upi') w.stats.addFlow('upi_volume', agg);
    }
    h.spendMonth += spent;

    // Better-off tricity households employ domestic help.
    if (h.region === 'chandigarh' && h.expectedIncome > 50000) {
      const help = (h.expectedIncome * 0.035) / 30;
      h.cash -= help; w.labourPool.chandigarh += help * h.weight;
      w.transfer('labour_hire', help * h.weight, w.hhAcct(h), null);
    }

    // ---- settle shop credit when flush
    if (h.udhaar > 0 && h.cash > h.expectedIncome * 0.8) {
      const pay = Math.min(h.udhaar, h.cash * 0.3);
      h.udhaar -= pay; h.cash -= pay;
      const g = h.loyalty.retail_grocery != null ? shops(w, h.region, 'retail_grocery').find(b => b.id === h.loyalty.retail_grocery) : undefined;
      if (g) { g.receivables = Math.max(0, g.receivables - pay * h.weight); g.cash += pay * h.weight; }
      w.transfer('udhaar_repay', pay * h.weight, w.hhAcct(h), g ? w.bizAcct(g) : null);
    }
    // ---- emergencies: deep overdraft triggers borrowing
    if (h.cash < -h.expectedIncome * 0.5) borrow(w, h, -h.cash + h.expectedIncome * 0.3, 'household expenses');
    // ---- scheduled wedding
    if (h.weddingPlannedDay != null && w.dayIndex >= h.weddingPlannedDay) wedding(w, h);
  }
}

export function borrow(w: World, h: Household, amount: number, purpose: string) {
  const t = h.traits;
  const income = Math.max(5000, h.expectedIncome);
  const bankLimit = h.farm && h.farm.ha > 0 ? h.farm.ha * 150000 : income * (h.salaryExpected > 0 ? 12 : 4);
  const bankOk = h.debtBank + amount <= bankLimit && w.rng.chance(0.15 + t.trustInInstitutions * 0.75);
  const fin = shops(w, h.region, 'finance');
  if (bankOk) {
    h.debtBank += amount; h.cash += amount;
    const b = fin.length ? w.rng.pick(fin) : null;
    if (b) b.loanBook += amount * h.weight;
    w.transfer('loan', amount * h.weight, b ? w.bizAcct(b) : null, w.hhAcct(h));
    w.note(h, 'credit', `Borrowed ₹${fmtK(amount)} from a bank for ${purpose} (trust in institutions ${t.trustInInstitutions.toFixed(2)}).`);
  } else {
    h.debtArhtiya += amount; h.cash += amount;
    const a = w.biz(h.arhtiyaId);
    if (a) { a.loanBook += amount * h.weight; a.cash -= amount * h.weight; }
    w.transfer('loan', amount * h.weight, a ? w.bizAcct(a) : null, w.hhAcct(h));
    w.note(h, 'credit', `Borrowed ₹${fmtK(amount)} informally${a ? ' from the arhtiya' : ''} at ${w.policy.informalRatePct}% for ${purpose}.`);
  }
}

export const fmtK = (n: number) => n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : `${Math.round(n / 1000)}k`;

function wedding(w: World, h: Household) {
  h.weddingPlannedDay = null;
  const t = h.traits;
  const annual = h.expectedIncome * 12;
  const cost = annual * (0.35 + t.statusConsumption * 0.9 + t.socialConformity * 0.45) * w.rng.range(0.7, 1.3);
  if (h.cash < cost) borrow(w, h, cost - Math.max(0, h.cash) + 10000, 'a family wedding');
  const split: [Archetype, number][] = [['jeweller', 0.4], ['events', 0.35], ['retail_cloth', 0.15], ['food_service', 0.1]];
  for (const [arch, share] of split) {
    const shop = chooseShop(w, h, arch);
    const amt = cost * share;
    h.cash -= amt; h.spendMonth += amt;
    if (shop) { shop.cash += amt * h.weight; shop.revenueDay += amt * h.weight; shop.revenueMonth += amt * h.weight; }
    w.transfer(shop ? 'wedding' : 'leakage', amt * h.weight, w.hhAcct(h), shop ? w.bizAcct(shop) : null);
  }
  w.note(h, 'wedding', `Hosted a wedding costing ₹${fmtK(cost)} (${(cost / annual).toFixed(1)}× annual income; status-consumption ${t.statusConsumption.toFixed(2)}).`);
}

export function householdsMonthly(w: World) {
  const m = w.month();
  // Labour market clears: index = wage demand pooled last month / expected wage bill.
  for (const r of ['moga', 'chandigarh'] as Region[]) {
    let expected = 0;
    for (const h of w.households) if (h.region === r) expected += h.wageIncomeExpected * h.weight;
    const supplied = w.labourPool[r] + expected * w.labourDemandIndex[r];   // pool was debited by wages paid
    const idx = expected > 0 ? Math.max(0.55, Math.min(1.25, supplied / expected)) : 1;
    w.labourDemandIndex[r] += (idx - w.labourDemandIndex[r]) * 0.5;
    w.labourPool[r] = 0;
  }
  const profitPool = w.profitPool;
  const bizWeights: Record<Region, number> = { moga: 0, chandigarh: 0 };
  for (const h of w.households) bizWeights[h.region] += h.businessIncomeExpected * h.weight;
  const itFirms = w.businesses.filter(b => b.archetype === 'it_services');
  const abroadShare = w.households.filter(h => h.region === 'moga' && h.membersAbroad > 0).length / Math.max(1, w.households.filter(h => h.region === 'moga').length);
  const bankRate = w.policy.bankRatePct / 100 / 12, infRate = w.policy.informalRatePct / 100 / 12;

  for (const h of w.households) {
    const t = h.traits;
    h.incomeLastMonth = h.incomeMonth; h.spendLastMonth = h.spendMonth;
    h.incomeMonth = 0; h.spendMonth = 0;

    // ---- salaries, pensions
    if (h.salaryExpected > 0) {
      const amt = h.salaryExpected;
      h.cash += amt; h.incomeMonth += amt;
      // IT salaries are attributed to IT firms for display; their wage cost is booked in businessesDaily.
      const it = /it_|software|tech/i.test(h.profile.id + h.profile.name) && itFirms.length ? w.rng.pick(itFirms) : null;
      w.transfer('salary', amt * h.weight, it ? w.bizAcct(it) : w.placeAcct(h.region === 'moga' ? 'moga' : 'chandigarh', 'gov'), w.hhAcct(h));
    }
    // ---- remittances
    if (h.remitExpected > 0) {
      const amt = h.remitExpected * w.policy.remittanceMult * w.rng.range(0.8, 1.2);
      h.cash += amt; h.incomeMonth += amt;
      w.transfer('remittance', amt * h.weight, null, w.hhAcct(h));
    }
    // ---- business owners draw profit
    if (h.businessIncomeExpected > 0 && bizWeights[h.region] > 0) {
      const share = (h.businessIncomeExpected * h.weight) / bizWeights[h.region];
      const amt = (profitPool[h.region] * share) / h.weight;
      if (amt !== 0) {
        h.cash += amt; h.incomeMonth += Math.max(0, amt);
        w.transfer('profit_draw', Math.max(0, amt * h.weight), null, w.hhAcct(h));
      }
    }
    // ---- interest
    const intBank = h.debtBank * bankRate, intInf = h.debtArhtiya * infRate;
    if (intBank > 0) {
      if (h.cash > intBank) { h.cash -= intBank; } else h.debtBank += intBank;
      w.transfer('interest', intBank * h.weight, w.hhAcct(h), null);
    }
    if (intInf > 0) {
      h.debtArhtiya += intInf;  // informal interest usually compounds into the account
      w.transfer('interest', intInf * h.weight, w.hhAcct(h), null);
    }
    // Pay down bank debt from surplus (more disciplined if loss-averse).
    if (h.debtBank > 0 && h.cash > h.expectedIncome * 2) {
      const pay = Math.min(h.debtBank, (h.cash - h.expectedIncome * 1.5) * (0.3 + 0.1 * t.lossAversion));
      h.debtBank -= pay; h.cash -= pay;
      w.transfer('repayment', pay * h.weight, w.hhAcct(h), null);
    }

    // ---- sentiment
    const incomeRatio = h.incomeLastMonth / Math.max(1, h.expectedIncome);
    const smoothRatio = h.farm && h.farm.ha > 0 ? Math.min(1.6, 0.5 + incomeRatio * 0.5) : incomeRatio;
    const debtLoad = (h.debtBank + h.debtArhtiya * 1.5) / Math.max(1, h.expectedIncome * 12);
    let target = 0.55 + 0.3 * (smoothRatio - 1) - 0.12 * Math.min(3, debtLoad) + (h.cash > h.expectedIncome ? 0.06 : -0.04);
    if (h.region === 'chandigarh' && w.env.aqi > 200) target -= 0.05;
    if (h.region === 'moga') target += 0.08 * (w.labourDemandIndex.moga - 1);
    h.sentiment += (clamp01(target) - h.sentiment) * 0.35;

    // ---- migration ladder
    migrationStep(w, h, abroadShare);

    // ---- wedding planning (peak season Oct–Feb)
    if (h.weddingPlannedDay == null && (m >= 10 || m <= 2)) {
      const p = (h.region === 'moga' ? 1 / 16 : 1 / 22) / 5 * (0.6 + t.socialConformity * 0.6);
      if (w.rng.chance(p)) h.weddingPlannedDay = w.dayIndex + w.rng.int(5, 40);
    }
  }
}

function migrationStep(w: World, h: Household, abroadShare: number) {
  const t = h.traits;
  const consultants = shops(w, h.region, 'immigration');
  const pay = (amt: number, kind: string, toLocal: boolean) => {
    if (h.cash < amt) borrow(w, h, amt - Math.max(0, h.cash) + 5000, kind);
    h.cash -= amt;
    const c = toLocal && consultants.length ? w.rng.pick(consultants) : null;
    if (c) { c.cash += amt * h.weight; c.revenueDay += amt * h.weight; c.revenueMonth += amt * h.weight; }
    w.transfer(c ? kind : 'leakage', amt * h.weight, w.hhAcct(h), c ? w.bizAcct(c) : null);
  };
  switch (h.migration) {
    case 'none': {
      if (t.migrationAspiration < 0.45 || h.membersAbroad >= 2) return;
      const pull = (t.migrationAspiration - 0.4) * 0.035 * (1 + t.socialConformity * abroadShare * 2) * (1.3 - h.sentiment * 0.6) * (0.4 + w.policy.visaSuccessProb);
      if (w.rng.chance(pull)) {
        h.migration = 'ielts'; h.migrationTimer = w.rng.int(3, 7);
        pay(18000, 'ielts', true);
        pay(17000, 'ielts_exam', false);
        w.note(h, 'migration', `Child enrolled in IELTS coaching (migration aspiration ${t.migrationAspiration.toFixed(2)}, ${Math.round(abroadShare * 100)}% of neighbours have someone abroad).`);
      }
      return;
    }
    case 'ielts': {
      pay(6000, 'ielts', true);
      if (--h.migrationTimer > 0) return;
      pay(60000, 'visa_consultancy', true);
      if (w.rng.chance(w.policy.visaSuccessProb)) {
        const cost = w.rng.range(1.6e6, 2.6e6);
        pay(cost, 'study_abroad', false);
        h.migration = 'abroad'; h.membersAbroad++; h.migrationTimer = 14;
        w.note(h, 'migration', `Study visa granted. Paid ₹${fmtK(cost)} for fees and first-year costs, much of it borrowed.`);
        if (w.rng.chance(0.08)) w.event('info', `A Moga family sent a child abroad on a study visa (₹${fmtK(cost)}).`);
      } else {
        h.migration = 'none'; h.sentiment = Math.max(0, h.sentiment - 0.1);
        w.note(h, 'migration', 'Visa refused. Family may try again next year.');
      }
      return;
    }
    case 'abroad': {
      if (h.migrationTimer > 0 && --h.migrationTimer === 0) {
        const add = w.rng.range(10000, 25000);
        h.remitExpected += add; h.expectedIncome += add;
        h.migration = 'none';
        w.note(h, 'migration', `Family member abroad now sends about ₹${fmtK(add)}/month.`);
      }
      return;
    }
    default: return;
  }
}
