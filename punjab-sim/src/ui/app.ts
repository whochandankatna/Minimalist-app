// DOM controls around the 3D view: clock, speed, tabs, inspector, policy, agent placement.
import type { Profile, TraitKey } from '../data/types';
import { dist } from '../geo/projection';
import { attachFarm } from '../sim/farming';
import { freightRate } from '../sim/logistics';
import { DEFAULT_TRAITS, type Household, type Region } from '../sim/model';
import { defaultPolicy, POLICY_CONTROLS, type Policy } from '../sim/policy';
import { SERIES, SERIES_LABEL, type SeriesKey } from '../sim/stats';
import type { World } from '../sim/world';
import { ARCH_COLORS, FLOW_COLORS, type Selection, type SimRenderer } from '../render/scene';
import { drawChart } from './chart';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function inr(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : 1)} cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${a.toFixed(0)}`;
}

const TRAIT_LABEL: Record<TraitKey, string> = {
  riskAversion: 'Risk aversion', timePreference: 'Impatience', priceSensitivity: 'Price sensitivity',
  socialConformity: 'Social conformity', statusConsumption: 'Status spending', brandLoyalty: 'Loyalty',
  digitalAdoption: 'Digital adoption', creditAppetite: 'Credit appetite', trustInInstitutions: 'Trust in institutions',
  migrationAspiration: 'Migration aspiration', religiosity: 'Religiosity', lossAversion: 'Loss aversion (λ)',
};

const SERIES_FMT: Partial<Record<SeriesKey, (n: number) => string>> = {
  truckUtil: n => `${(n * 100).toFixed(0)}%`, sentimentMoga: n => n.toFixed(2), sentimentChd: n => n.toFixed(2),
  employmentMoga: n => n.toFixed(2), aqi: n => n.toFixed(0), burns: n => n.toFixed(0), jobsWaiting: n => n.toFixed(0),
  mandiBacklogT: n => `${(n / 1000).toFixed(0)}k t`, abroad: n => `${(n / 1000).toFixed(1)}k`, cpi: n => n.toFixed(3),
  paddyPrice: n => `₹${n.toFixed(0)}`, wheatPrice: n => `₹${n.toFixed(0)}`, basmatiPrice: n => `₹${n.toFixed(0)}`, milkPrice: n => `₹${n.toFixed(1)}`,
};
const fmtSeries = (k: SeriesKey) => SERIES_FMT[k] ?? inr;

function season(w: World): string {
  const m = w.month(), d = w.dayOfMonth();
  if (m === 10 || (m === 11 && d < 15)) return 'Paddy harvest · procurement';
  if (m === 11 || (m === 12 && d < 15)) return 'Wheat sowing';
  if (m === 12 || m <= 2) return 'Wheat growing · wedding season';
  if (m === 3) return 'Wheat ripening';
  if (m === 4 || m === 5) return 'Wheat harvest · procurement';
  if (m === 6) return 'Paddy transplanting';
  return 'Monsoon · paddy growing';
}

type Tab = 'overview' | 'markets' | 'agents' | 'trucks' | 'policy' | 'log' | 'data';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['markets', 'Markets'], ['agents', 'Agents'], ['trucks', 'Trucks'], ['policy', 'Policy'], ['log', 'Log'], ['data', 'Data']];

export class App {
  speed = 6;
  tab: Tab = 'overview';
  chartKeys: [SeriesKey, SeriesKey] = ['consumption', 'paddyPrice'];
  placing: { profile: Profile; traits: Record<TraitKey, number>; count: number; weight: number } | null = null;
  private refreshTimer = 0;

  constructor(public w: World, public r: SimRenderer) {
    this.buildChrome();
    this.renderTab();
    try { const t = localStorage.getItem('pcs-tab') as Tab | null; if (t && TABS.some(x => x[0] === t)) { this.tab = t; this.renderTab(); } } catch { /* storage unavailable */ }
  }

  // ------------------------------------------------------------- chrome
  private buildChrome() {
    document.querySelectorAll<HTMLButtonElement>('.speed button').forEach(b => {
      b.addEventListener('click', () => this.setSpeed(Number(b.dataset.speed)));
    });
    this.setSpeed(this.speed);
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault(); this.setSpeed(this.speed ? 0 : 6);
      }
      if (e.key === 'Escape') { this.cancelPlacing(); this.select(null); }
    });
    const flyTargets: [string, string, number][] = [
      ['Corridor', 'corridor', 0], ['Moga', 'moga', 9], ['Moga mandi', this.w.key.mandis[0], 1.6], ['Nestlé plant', this.w.key.nestle, 1.4],
      ['Grain godown', this.w.key.godown, 1.4], ['Ludhiana', 'ludhiana', 16], ['Chandigarh', 'chandigarh', 14], ['Village', this.w.key.villages[0], 2.2],
    ];
    const nav = $('places');
    for (const [label, id, d] of flyTargets) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        if (id === 'corridor') {
          const a = this.w.place('moga')!, c = this.w.place('chandigarh')!;
          this.r.flyTo((a.x + c.x) / 2, (a.z + c.z) / 2, 150);
        } else { const p = this.w.place(id); if (p) this.r.flyTo(p.x, p.z, d); }
      });
      nav.appendChild(b);
    }
    const layers = $('layers');
    for (const [k, label] of [['trucks', 'Trucks'], ['households', 'Households'], ['businesses', 'Businesses'], ['flows', 'Money flows'], ['labels', 'Labels']] as const) {
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox" id="layer-${k}" ${this.r.layers[k] ? 'checked' : ''}> ${label}`;
      l.querySelector('input')!.addEventListener('change', e => { this.r.layers[k] = (e.target as HTMLInputElement).checked; });
      layers.appendChild(l);
    }
    const tabs = document.querySelector('.tabs')!;
    for (const [id, label] of TABS) {
      const b = document.createElement('button');
      b.textContent = label; b.dataset.tab = id; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { this.tab = id; try { localStorage.setItem('pcs-tab', id); } catch { /* ignore */ } this.renderTab(); });
      tabs.appendChild(b);
    }
    // Map clicks: place agents in placing mode, otherwise select.
    const canvas = this.r.renderer.domElement;
    let down = { x: 0, y: 0 };
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // drag, not click
      if (this.placing) { this.placeAt(e.clientX, e.clientY); return; }
      this.select(this.r.pick(e.clientX, e.clientY));
    });
    $('cancel-place').addEventListener('click', () => this.cancelPlacing());
  }

  setSpeed(s: number) {
    this.speed = s;
    document.querySelectorAll<HTMLButtonElement>('.speed button').forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === s));
  }

  toast(msg: string) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout((t as unknown as { _h?: number })._h);
    (t as unknown as { _h?: number })._h = window.setTimeout(() => { t.hidden = true; }, 2600);
  }

  /** Called every frame; DOM refresh is throttled. */
  tick(dt: number) {
    const w = this.w;
    $('date').textContent = w.dateLabel();
    const hr = w.hourOfDay();
    $('time').textContent = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor((hr % 1) * 60)).padStart(2, '0')}`;
    $('season').textContent = season(w);
    this.refreshTimer += dt;
    if (this.refreshTimer > 0.5) { this.refreshTimer = 0; this.refreshTab(); this.renderInspector(); }
  }

  // ------------------------------------------------------------- tabs
  private renderTab() {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    const body = $('panel-body');
    body.innerHTML = '';
    switch (this.tab) {
      case 'overview': body.innerHTML = this.overviewShell(); this.wireOverview(); break;
      case 'policy': this.buildPolicy(body); break;
      case 'agents': this.buildAgents(body); break;
      default: break;
    }
    this.refreshTab();
  }

  private refreshTab() {
    const body = $('panel-body');
    switch (this.tab) {
      case 'overview': this.refreshOverview(); break;
      case 'markets': body.innerHTML = this.markets(); this.wireRows(body); break;
      case 'trucks': body.innerHTML = this.trucks(); this.wireRows(body); break;
      case 'agents': this.refreshAgents(); break;
      case 'log': body.innerHTML = this.logHtml(); break;
      case 'data': if (!body.dataset.built) { body.innerHTML = this.dataHtml(); body.dataset.built = '1'; } break;
      default: break;
    }
    if (this.tab !== 'data') delete body.dataset.built;
  }

  private overviewShell(): string {
    const opts = (sel: SeriesKey) => SERIES.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${SERIES_LABEL[k]}</option>`).join('');
    return `
      <div><h2>Regional economy</h2><p class="note">Aggregates for ~2.25 lakh Moga and ~5.6 lakh tricity households, simulated by ${this.w.households.length.toLocaleString('en-IN')} representative agents.</p></div>
      <div class="kpis" id="kpis"></div>
      ${[0, 1].map(i => `<div class="chart"><div class="chart-head"><select id="chart-sel-${i}" aria-label="Chart series">${opts(this.chartKeys[i])}</select><span class="mono" id="chart-val-${i}"></span></div><canvas id="chart-${i}"></canvas></div>`).join('')}
      <div><h3>Kharif crop mix (planted area)</h3><div id="cropmix" class="flows"></div></div>
      <div><h3>Money flows this month</h3><div id="flows" class="flows"></div></div>`;
  }

  private wireOverview() {
    [0, 1].forEach(i => $(`chart-sel-${i}`).addEventListener('change', e => {
      this.chartKeys[i] = (e.target as HTMLSelectElement).value as SeriesKey; this.refreshOverview();
    }));
  }

  private refreshOverview() {
    const w = this.w, s = w.stats;
    const k = (label: string, v: string, cls = '') => `<div class="kpi"><div class="k" title="${label}">${label}</div><div class="v ${cls}">${v}</div></div>`;
    const sentM = s.last('sentimentMoga'), sentC = s.last('sentimentChd');
    const sc = (v: number) => (v > 0.58 ? 'good' : v < 0.45 ? 'crit' : 'warn');
    const aqi = w.env.aqi;
    let backlog = 0; for (const st of w.mandiStock.values()) for (const v of Object.values(st)) backlog += v;
    const el = $('kpis');
    if (!el) return;
    el.innerHTML = [
      k('Consumption /day', inr(s.last('consumption'))), k('Household income /day', inr(s.last('hhIncome'))), k('Freight /day', inr(s.last('freight'))),
      k('Paddy ₹/qtl (MSP ' + (w.msp('paddy') ?? 0).toFixed(0) + ')', `₹${(w.prices.paddy ?? 0).toFixed(0)}`), k('Wheat ₹/qtl (MSP ' + (w.msp('wheat') ?? 0).toFixed(0) + ')', `₹${(w.prices.wheat ?? 0).toFixed(0)}`), k('Milk ₹/L', `₹${w.prices.milk.toFixed(1)}`),
      k('Sentiment · Moga', sentM.toFixed(2), sc(sentM)), k('Sentiment · tricity', sentC.toFixed(2), sc(sentC)), k('Farm labour demand', w.labourDemandIndex.moga.toFixed(2), w.labourDemandIndex.moga < 0.9 ? 'warn' : 'good'),
      k('Trucks busy', `${(s.last('truckUtil') * 100).toFixed(0)}%`), k('Unlifted mandi grain', `${(backlog / 1000).toFixed(0)}k t`, backlog > 200000 ? 'crit' : backlog > 60000 ? 'warn' : ''), k('Grain rakes out', String(w.ag.rakesDispatched)),
      k('AQI · Chandigarh', aqi.toFixed(0), aqi > 200 ? 'crit' : aqi > 100 ? 'warn' : 'good'), k('Stubble burned', `${Math.round(w.env.burnHaSeason).toLocaleString('en-IN')} ha`), k('Groundwater depth', `${w.env.groundwaterDepthM.toFixed(1)} m`),
      k('Households w/ member abroad', `${(s.last('abroad') / 1000).toFixed(1)}k`), k('Debt / farm household', inr(s.last('debtPerFarmHh'))), k('Local price index', w.prices.cpi.toFixed(3)),
    ].join('');
    const colors = ['#e8a83a', '#5cc28a'];
    [0, 1].forEach(i => {
      const key = this.chartKeys[i];
      const vals = s.series[key];
      drawChart($(`chart-${i}`) as HTMLCanvasElement, vals, colors[i], fmtSeries(key));
      $(`chart-val-${i}`).textContent = vals.length ? fmtSeries(key)(vals[vals.length - 1]) : '';
    });
    const ks = Object.entries(w.ag.share.kharif).sort((a, b) => b[1] - a[1]);
    $('cropmix').innerHTML = ks.map(([c, v]) => `<div class="flow-row"><span>${esc((w.crops.get(c)?.name ?? c).split('(')[0].trim())}</span><div class="bar"><i style="width:${(v * 100).toFixed(1)}%"></i></div><span class="mono">${(v * 100).toFixed(1)}%</span></div>`).join('');
    const src = Object.keys(s.flowsMonth).length > 3 ? s.flowsMonth : s.flowsLastMonth;
    const fl = Object.entries(src).filter(([k]) => k !== 'upi_volume').sort((a, b) => b[1] - a[1]).slice(0, 12);
    const max = fl[0]?.[1] ?? 1;
    $('flows').innerHTML = fl.map(([kind, v]) => `<div class="flow-row"><span><i class="swatch" style="background:${hex(FLOW_COLORS[kind] ?? 0x868e96)}"></i>${kind.replace(/_/g, ' ')}</span><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%;background:${hex(FLOW_COLORS[kind] ?? 0x868e96)}"></i></div><span class="mono">${inr(v)}</span></div>`).join('');
  }

  private markets(): string {
    const w = this.w;
    const agg = new Map<string, { name: string; region: string; arch: string; firms: number; rev: number; profit: number; price: number; n: number; first: number }>();
    for (const b of w.businesses) {
      const key = `${b.sector.id}|${b.region}`;
      const a = agg.get(key) ?? { name: b.sector.name, region: b.region, arch: b.archetype, firms: 0, rev: 0, profit: 0, price: 0, n: 0, first: b.id };
      a.firms += b.weight; a.rev += b.revenueLastMonth; a.profit += b.profitLastMonth; a.price += b.priceIndex; a.n++;
      agg.set(key, a);
    }
    const rows = [...agg.values()].sort((a, b) => b.rev - a.rev);
    return `<div><h2>Businesses</h2><p class="note">${w.businesses.length} firm agents standing in for ~${Math.round(rows.reduce((a, r) => a + r.firms, 0)).toLocaleString('en-IN')} real establishments. Last full month. Click a row to locate it.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Sector</th><th>Area</th><th class="num">Firms</th><th class="num">Revenue/mo</th><th class="num">Profit/mo</th><th class="num">Price</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="click" data-sel="business:${r.first}"><td><i class="swatch" style="background:${hex(ARCH_COLORS[r.arch as keyof typeof ARCH_COLORS] ?? 0x888888)}"></i>${esc(r.name)}</td><td>${r.region === 'moga' ? 'Moga' : 'Tricity'}</td><td class="num">${Math.round(r.firms).toLocaleString('en-IN')}</td><td class="num">${inr(r.rev)}</td><td class="num">${inr(r.profit)}</td><td class="num">${(r.price / r.n).toFixed(2)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  private trucks(): string {
    const w = this.w;
    const by: Record<string, number> = {};
    for (const t of w.trucks) by[t.state] = (by[t.state] ?? 0) + 1;
    const waiting = w.jobs.filter(j => j.takenBy == null);
    const top = [...w.trucks].sort((a, b) => b.earnMonth - a.earnMonth).slice(0, 14);
    const pn = (id: string) => esc(w.place(id)?.name ?? id);
    const stateLabel: Record<string, string> = { idle: 'Idle', toPickup: 'To pickup', loading: 'Loading', loaded: 'Loaded', unloading: 'Unloading', returning: 'Returning' };
    return `<div><h2>Trucking</h2><p class="note">${w.trucks.length} truck agents, each a convoy of 10 real trucks. Regime: <b>${w.policy.freightRegime === 'cartel' ? 'union turn system' : 'open market'}</b>. Rate ₹${freightRate(w).toFixed(2)}/t-km, diesel ₹${w.diesel().toFixed(2)}/L.</p></div>
      <div class="kpis">${Object.entries(stateLabel).map(([k, l]) => `<div class="kpi"><div class="k">${l}</div><div class="v">${by[k] ?? 0}</div></div>`).join('')}</div>
      <div><h3>Loads waiting (${waiting.length})</h3><div class="tbl-wrap"><table><thead><tr><th>From</th><th>To</th><th>Cargo</th><th class="num">Tonnes</th><th class="num">Pay</th></tr></thead><tbody>
      ${waiting.slice(0, 10).map(j => `<tr class="click" data-sel="place:${j.from}"><td>${pn(j.from)}</td><td>${pn(j.to)}</td><td>${j.commodity}</td><td class="num">${j.tonnes.toFixed(0)}</td><td class="num">${inr(j.pay)}</td></tr>`).join('') || '<tr><td colspan="5" class="note">No loads waiting.</td></tr>'}
      </tbody></table></div></div>
      <div><h3>Top earners this month</h3><div class="tbl-wrap"><table><thead><tr><th>Truck</th><th>Status</th><th class="num">km</th><th class="num">Freight</th><th class="num">Diesel</th></tr></thead><tbody>
      ${top.map(t => `<tr class="click" data-sel="truck:${t.id}"><td><i class="swatch" style="background:${hex(t.color)}"></i>#${t.id} ${esc(t.typeName.split('(')[0])}</td><td>${stateLabel[t.state]}</td><td class="num">${t.kmMonth.toFixed(0)}</td><td class="num">${inr(t.earnMonth)}</td><td class="num">${inr(t.fuelMonth)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  private wireRows(body: HTMLElement) {
    body.querySelectorAll<HTMLTableRowElement>('tr[data-sel]').forEach(tr => tr.addEventListener('click', () => {
      const [kind, id] = tr.dataset.sel!.split(':');
      const sel = (kind === 'place' ? { kind, id } : { kind, id: Number(id) }) as Selection;
      this.select(sel, true);
    }));
  }

  private logHtml(): string {
    const ev = [...this.w.events].reverse().slice(0, 120);
    const d = (day: number) => new Date(Date.UTC(2026, 9, 1) + day * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    return `<div><h2>Event log</h2><p class="note">Market events, policy changes and notable agent decisions.</p></div><div class="log">${ev.map(e => `<div class="${e.kind}"><span class="d">${d(e.day)}</span>${esc(e.text)}</div>`).join('')}</div>`;
  }

  private dataHtml(): string {
    const d = this.w.data;
    const sets: [string, { meta?: { sources?: { id: string; title: string; url?: string }[]; compiledOn?: string } }, boolean][] = [
      ['Geography & highways', d.geography, d.provenance.geography], ['Agriculture & dairy', d.agriculture, d.provenance.agriculture],
      ['Businesses', d.businesses, d.provenance.businesses], ['Logistics & trucking', d.logistics, d.provenance.logistics],
      ['Psychographic profiles', d.psychographics, d.provenance.psychographics],
    ];
    return `<div><h2>Data &amp; sources</h2><p class="note">Research agents compiled each dataset from public sources. Narrative write-ups with caveats live in <span class="mono">punjab-sim/research/</span>. Where a dataset is marked "built-in fallback", the model uses approximate seed values.</p></div>
      ${sets.map(([name, ds, researched]) => `<div><h3>${name} · ${researched ? `researched${ds.meta?.compiledOn ? ' ' + ds.meta.compiledOn : ''}` : 'built-in fallback'}</h3>
        <div class="log">${(ds.meta?.sources ?? []).slice(0, 40).map(s => `<div>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:var(--sarson)">${esc(s.title)}</a>` : esc(s.title)}</div>`).join('') || '<div class="note">No source list.</div>'}</div></div>`).join('')}
      <div><h3>Model scale</h3><p class="note">1 truck agent = 10 trucks · household agents weighted to ~7.85 lakh households · firm agents weighted by researched establishment counts. Prices in 2026 ₹.</p></div>`;
  }

  // ------------------------------------------------------------- policy
  private buildPolicy(body: HTMLElement) {
    const w = this.w;
    body.innerHTML = `<div><h2>Policy levers</h2><p class="note">Changes apply immediately. Crop choices respond at the next sowing window (June for kharif, November for rabi).</p></div>
      <div><h3>Scenarios</h3><div class="presets" id="presets"></div></div><div id="controls" style="display:flex;flex-direction:column;gap:12px"></div>`;
    const presets: [string, Partial<Policy>, string][] = [
      ['Diversify from paddy', { maizeAssuredProcurement: true, diversificationIncentivePerHa: 17500 }, 'Assured maize procurement plus ₹17,500/ha (₹7,000/acre) for leaving paddy.'],
      ['Truck union cartel', { freightRegime: 'cartel' }, 'Union rate card and turn-based allotment.'],
      ['Study-visa caps', { visaSuccessProb: 0.15, remittanceMult: 0.85 }, 'Tighter study permits abroad.'],
      ['Diesel shock', { dieselPrice: 125 }, 'Diesel jumps to ₹125/L.'],
      ['Weak monsoon', { monsoon: 0.7 }, 'Kharif yields fall ~30%.'],
      ['Stubble crackdown', { stubbleFinePerHa: 30000, stubbleEnforcement: 0.6, stubbleSubsidyPerHa: 2500 }, 'Higher fines, enforcement and support.'],
      ['UPI push', { upiPush: 0.4 }, 'Digital payment drive.'],
      ['Reset all', defaultPolicy(), 'Back to baseline.'],
    ];
    const pre = $('presets');
    for (const [label, p, desc] of presets) {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = label; b.title = desc;
      b.addEventListener('click', () => {
        Object.assign(w.policy, p);
        w.event('policy', `Scenario applied: ${label}. ${desc}`);
        this.toast(`Applied: ${label}`);
        this.buildPolicy(body);
      });
      pre.appendChild(b);
    }
    const box = $('controls');
    for (const c of POLICY_CONTROLS) {
      const div = document.createElement('div');
      div.className = 'ctrl';
      const v = w.policy[c.key];
      const id = `pol-${c.key}`;
      if (c.kind === 'range') {
        const cur = (v ?? (c.key === 'dieselPrice' ? w.diesel() : c.key === 'arhtiyaCommissionPct' ? w.commissionPct() : 0)) as number;
        div.innerHTML = `<label for="${id}">${c.label}</label><span class="val">${fmtPol(cur)}</span><input id="${id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${cur}"><span class="help">${c.help}</span>`;
        const input = div.querySelector('input')!, val = div.querySelector('.val')!;
        input.addEventListener('input', () => { (w.policy as unknown as Record<string, number>)[c.key] = Number(input.value); val.textContent = fmtPol(Number(input.value)); });
        input.addEventListener('change', () => w.event('policy', `${c.label} set to ${fmtPol(Number(input.value))}.`));
      } else if (c.kind === 'toggle') {
        div.innerHTML = `<label for="${id}">${c.label}</label><input id="${id}" type="checkbox" ${v ? 'checked' : ''} style="accent-color:var(--sarson)"><span class="help">${c.help}</span>`;
        div.querySelector('input')!.addEventListener('change', e => {
          (w.policy as unknown as Record<string, boolean>)[c.key] = (e.target as HTMLInputElement).checked;
          w.event('policy', `${c.label}: ${(e.target as HTMLInputElement).checked ? 'on' : 'off'}.`);
        });
      } else {
        div.innerHTML = `<label for="${id}">${c.label}</label><select id="${id}">${c.options!.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select><span class="help">${c.help}</span>`;
        div.querySelector('select')!.addEventListener('change', e => {
          (w.policy as unknown as Record<string, string>)[c.key] = (e.target as HTMLSelectElement).value;
          w.event('policy', `${c.label}: ${(e.target as HTMLSelectElement).value}.`);
        });
      }
      box.appendChild(div);
    }
  }

  // ------------------------------------------------------------- agents
  private buildAgents(body: HTMLElement) {
    const w = this.w;
    const profiles = w.data.psychographics.profiles;
    body.innerHTML = `<div><h2>Agents &amp; psychographics</h2><p class="note">Each profile carries researched income, spending and payment mixes plus behavioural traits. Click a row to see a sample agent.</p></div>
      <div class="tbl-wrap"><table><thead><tr><th>Profile</th><th class="num">Agents</th><th class="num">Income/mo</th><th class="num">Spend/mo</th><th class="num">Debt</th><th class="num">Mood</th></tr></thead><tbody id="prof-rows"></tbody></table></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <h2>Add agents</h2>
        <p class="note">Pick a profile, adjust its psychology, then click the map. New agents earn, spend, borrow and migrate like the rest, and show as larger dots.</p>
        <div class="ctrl"><label for="sp-profile">Profile</label><span></span><select id="sp-profile" style="grid-column:1/-1">${profiles.map(p => `<option value="${p.id}">${esc(p.name)} · ${p.region === 'moga' ? 'Moga' : 'Tricity'}</option>`).join('')}</select></div>
        <div class="ctrl"><label for="sp-count">Agents to place</label><span class="val" id="sp-count-v">10</span><input id="sp-count" type="range" min="1" max="60" value="10"></div>
        <div class="ctrl"><label for="sp-weight">Real households per agent</label><span class="val" id="sp-weight-v">40</span><input id="sp-weight" type="range" min="1" max="400" value="40"></div>
        <div id="sp-traits" style="display:flex;flex-direction:column;gap:8px"></div>
        <div id="sp-rules" class="note"></div>
        <div class="presets"><button class="btn primary" id="sp-place">Place on map</button><button class="btn" id="sp-home">Add at usual homes</button></div>
      </div>`;
    const sel = $<HTMLSelectElement>('sp-profile');
    const traits: Record<string, number> = {};
    const drawTraits = () => {
      const p = profiles.find(x => x.id === sel.value)!;
      const box = $('sp-traits'); box.innerHTML = '';
      for (const k of Object.keys(DEFAULT_TRAITS) as TraitKey[]) {
        const v = p.traits[k] ?? DEFAULT_TRAITS[k];
        traits[k] = v;
        const max = k === 'lossAversion' ? 4 : 1;
        const d = document.createElement('div'); d.className = 'ctrl';
        d.innerHTML = `<label for="tr-${k}">${TRAIT_LABEL[k]}</label><span class="val">${v.toFixed(2)}</span><input id="tr-${k}" type="range" min="${k === 'lossAversion' ? 1 : 0}" max="${max}" step="0.01" value="${v}">`;
        const inp = d.querySelector('input')!, val = d.querySelector('.val')!;
        inp.addEventListener('input', () => { traits[k] = Number(inp.value); val.textContent = Number(inp.value).toFixed(2); });
        box.appendChild(d);
      }
      $('sp-rules').innerHTML = (p.decisionRules ?? []).slice(0, 4).map(r => `• ${esc(r)}`).join('<br>');
    };
    sel.addEventListener('change', drawTraits);
    drawTraits();
    for (const id of ['sp-count', 'sp-weight']) $(id).addEventListener('input', e => { $(`${id}-v`).textContent = (e.target as HTMLInputElement).value; });
    const read = () => ({
      profile: profiles.find(x => x.id === sel.value)!, traits: { ...traits } as Record<TraitKey, number>,
      count: Number($<HTMLInputElement>('sp-count').value), weight: Number($<HTMLInputElement>('sp-weight').value),
    });
    $('sp-place').addEventListener('click', () => { this.placing = read(); $('placing').hidden = false; });
    $('sp-home').addEventListener('click', () => {
      const spec = read();
      const added = this.spawn(spec, null);
      this.toast(`Added ${added.length} ${spec.profile.name} agents`);
    });
  }

  private refreshAgents() {
    const w = this.w;
    const rows = $('prof-rows');
    if (!rows) return;
    const by = w.householdsByProfile();
    rows.innerHTML = w.data.psychographics.profiles.map(p => {
      const hs = by.get(p.id) ?? [];
      if (!hs.length) return '';
      const avg = (f: (h: Household) => number) => hs.reduce((a, h) => a + f(h) * h.weight, 0) / hs.reduce((a, h) => a + h.weight, 0);
      const mood = avg(h => h.sentiment);
      return `<tr class="click" data-sel="household:${hs[0].id}"><td><i class="swatch" style="background:${hex(this.r.profileColors.get(p.id) ?? 0xffffff)}"></i>${esc(p.name)}</td><td class="num">${hs.length}</td><td class="num">${inr(avg(h => h.incomeLastMonth))}</td><td class="num">${inr(avg(h => h.spendLastMonth))}</td><td class="num">${inr(avg(h => h.debtBank + h.debtArhtiya))}</td><td class="num" style="color:${mood > 0.58 ? 'var(--good)' : mood < 0.45 ? 'var(--crit)' : 'var(--warn)'}">${mood.toFixed(2)}</td></tr>`;
    }).join('');
    this.wireRows(rows.closest('table')!.parentElement!);
  }

  private placeAt(cx: number, cy: number) {
    const pt = this.r.groundPoint(cx, cy);
    if (!pt || !this.placing) return;
    const added = this.spawn(this.placing, pt);
    this.toast(`Placed ${added.length} ${this.placing.profile.name} agents`);
    this.cancelPlacing();
    if (added[0]) this.select({ kind: 'household', id: added[0].id });
  }

  private spawn(spec: NonNullable<App['placing']>, at: { x: number; z: number } | null): Household[] {
    const w = this.w;
    const out: Household[] = [];
    let region: Region = spec.profile.region === 'chandigarh' ? 'chandigarh' : 'moga';
    let placeId: string | undefined;
    if (at) {
      const m = w.place('moga')!, c = w.place('chandigarh')!;
      region = dist(at, m) < dist(at, c) ? 'moga' : 'chandigarh';
      let best = Infinity;
      for (const p of w.places.values()) {
        if (p.region !== region || !['city', 'town', 'village_cluster'].includes(p.type)) continue;
        const d = dist(at, p); if (d < best) { best = d; placeId = p.id; }
      }
    }
    for (let i = 0; i < spec.count; i++) {
      const pos = at ? { x: at.x + (w.rng.next() - 0.5) * 0.8, z: at.z + (w.rng.next() - 0.5) * 0.8 } : undefined;
      const h = w.addHousehold(spec.profile, region, spec.weight, { placeId, at: pos, traits: spec.traits, custom: true });
      attachFarm(w, h, undefined, false);
      w.note(h, 'spawn', `Placed by you as a ${spec.profile.name}${region !== spec.profile.region ? ` (living in ${region === 'moga' ? 'Moga district' : 'the tricity'})` : ''}.`);
      out.push(h);
    }
    w.event('info', `You added ${spec.count} ${spec.profile.name} agents (${(spec.count * spec.weight).toLocaleString('en-IN')} households) in ${region === 'moga' ? 'Moga district' : 'the tricity'}.`);
    return out;
  }

  private cancelPlacing() { this.placing = null; $('placing').hidden = true; }

  // ------------------------------------------------------------- inspector
  select(sel: Selection | null, fly = false) {
    this.r.selection = sel;
    if (sel && fly) {
      const p = this.r.selectionPos();
      if (p) this.r.flyTo(p.x, p.z, sel.kind === 'place' ? 2.5 : 1.2);
    }
    this.renderInspector();
  }

  private renderInspector() {
    const el = $('inspector');
    const sel = this.r.selection;
    if (!sel) { el.hidden = true; return; }
    const w = this.w;
    const kv = (rows: [string, string][]) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const dec = (log: { day: number; kind: string; text: string }[]) => log.length
      ? `<div><h3>Recent decisions</h3><div class="decisions">${[...log].reverse().slice(0, 8).map(d => `<div><span class="d">${new Date(Date.UTC(2026, 9, 1) + d.day * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })} · ${d.kind}</span>${esc(d.text)}</div>`).join('')}</div></div>` : '';
    let html = '';
    if (sel.kind === 'household') {
      const h = w.households.find(x => x.id === sel.id);
      if (!h) { el.hidden = true; return; }
      const f = h.farm;
      html = `<header><div><h2>${esc(h.profile.name)}</h2><p class="note">${esc(w.place(h.placeId)?.name ?? '')} · represents ${Math.round(h.weight)} households${h.custom ? ' · placed by you' : ''}</p></div><button class="close" aria-label="Close">✕</button></header>
        ${kv([['Income last month', inr(h.incomeLastMonth)], ['Expected income', inr(h.expectedIncome) + '/mo'], ['Spent last month', inr(h.spendLastMonth)], ['Cash', inr(h.cash)], ['Bank debt', inr(h.debtBank)], ['Informal / arhtiya debt', inr(h.debtArhtiya)], ['Shop credit (udhaar)', inr(h.udhaar)], ['Sentiment', h.sentiment.toFixed(2)], ['Migration', h.migration === 'none' ? (h.membersAbroad ? `${h.membersAbroad} abroad` : '—') : h.migration]])}
        ${f ? `<div><h3>Farm</h3>${kv([['Land', `${f.ha.toFixed(1)} ha (${(f.ha * 2.471).toFixed(1)} acres)`], ['In the ground', f.crop ? `${w.crops.get(f.crop)?.name} · harvest ~${new Date(Date.UTC(2026, 9, 1) + f.harvestDay * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : '—'], ['Stored grain', f.stock ? `${f.stock.qtl.toFixed(0)} qtl ${f.stock.crop}` : '—'], ['Dairy animals', `${f.animals} → ${f.dairyBuyer === 'nestle' ? 'Nestlé' : f.dairyBuyer === 'verka' ? 'Verka' : 'local buyer'}`], ['Stubble', f.stubble], ['Mandi', esc(w.place(f.mandiId)?.name ?? '')]])}</div>` : ''}
        <div><h3>Psychology</h3><div class="traits">${(Object.keys(TRAIT_LABEL) as TraitKey[]).map(k => { const v = h.traits[k]; const pct = k === 'lossAversion' ? (v - 1) / 3 : v; return `<span>${TRAIT_LABEL[k]}</span><div class="bar"><i style="width:${(pct * 100).toFixed(0)}%"></i></div><span class="mono">${v.toFixed(2)}</span>`; }).join('')}</div></div>
        ${dec(h.log)}`;
    } else if (sel.kind === 'business') {
      const b = w.biz(sel.id);
      if (!b) { el.hidden = true; return; }
      html = `<header><div><h2><i class="swatch" style="background:${hex(ARCH_COLORS[b.archetype])}"></i>${esc(b.sector.name)}</h2><p class="note">${esc(w.place(b.placeId)?.name ?? '')} · represents ${Math.round(b.weight).toLocaleString('en-IN')} firms · type: ${b.archetype.replace(/_/g, ' ')}</p></div><button class="close" aria-label="Close">✕</button></header>
        ${kv([['Revenue last month', inr(b.revenueLastMonth)], ['Profit last month', inr(b.profitLastMonth)], ['Revenue this month', inr(b.revenueMonth)], ['Cash', inr(b.cash)], ['Inventory', inr(b.inventory)], ['Price vs market', b.priceIndex.toFixed(2) + '×'], ['Customer credit owed', inr(b.receivables)], ['Loans outstanding', inr(b.loanBook)]])}
        ${b.sector.paymentTerms ? `<p class="note"><b>Payment terms:</b> ${esc(b.sector.paymentTerms)}</p>` : ''}${b.sector.creditPractice ? `<p class="note"><b>Credit practice:</b> ${esc(b.sector.creditPractice)}</p>` : ''}
        ${dec(b.log)}`;
    } else if (sel.kind === 'truck') {
      const t = w.trucks.find(x => x.id === sel.id);
      if (!t) { el.hidden = true; return; }
      const owner = w.biz(t.ownerBizId);
      html = `<header><div><h2>Truck #${t.id}</h2><p class="note">${esc(t.typeName)} · convoy of 10 · home ${esc(w.place(t.home)?.name ?? t.home)}${owner ? ` · ${esc(owner.sector.name)}` : ''}</p></div><button class="close" aria-label="Close">✕</button></header>
        ${kv([['Status', t.state], ['Load', t.job ? `${t.job.tonnes.toFixed(0)} t ${t.job.commodity}: ${esc(w.place(t.job.from)?.name ?? '')} → ${esc(w.place(t.job.to)?.name ?? '')}` : '—'], ['Job pays', t.job ? inr(t.job.pay) : '—'], ['Route', t.route ? `${t.route.km.toFixed(0)} km via ${t.route.highways.map(x => x.toUpperCase().replace(/_.*/, '')).join(', ') || 'local roads'}` : '—'], ['Tolls on route', t.route?.tolls.join(', ') || '—'], ['This month', `${t.kmMonth.toFixed(0)} km · ${inr(t.earnMonth)} earned`], ['Diesel / tolls', `${inr(t.fuelMonth)} / ${inr(t.tollMonth)}`], ['Lifetime trips', String(t.tripsTotal)]])}`;
    } else {
      const p = w.place(sel.id);
      if (!p) { el.hidden = true; return; }
      const stock = w.mandiStock.get(p.id);
      const firms = w.businesses.filter(b => b.placeId === p.id);
      const hh = w.households.filter(h => h.placeId === p.id);
      html = `<header><div><h2>${esc(p.name)}</h2><p class="note">${p.type.replace(/_/g, ' ')}${p.population ? ` · pop. ${p.population.toLocaleString('en-IN')}` : ''}${p.region !== 'external' ? ` · ${p.region === 'moga' ? 'Moga district' : 'tricity'}` : ''}</p></div><button class="close" aria-label="Close">✕</button></header>
        ${p.notes ? `<p class="note">${esc(p.notes)}</p>` : ''}
        ${kv([['Firm agents here', String(firms.length)], ['Household agents here', String(hh.length)], ...(stock ? Object.entries(stock).map(([c, t]) => [`Unlifted ${c}`, `${t.toFixed(0)} t`] as [string, string]) : []), ...(p.id === w.key.godown ? [['Godown stock', `wheat ${w.godownStock.wheat.toFixed(0)} t · rice ${w.godownStock.rice.toFixed(0)} t`] as [string, string]] : []), ...(p.id === w.key.railhead ? [['At railhead', `${w.ag.railheadT.toFixed(0)} t`], ['Rakes dispatched', String(w.ag.rakesDispatched)]] as [string, string][] : []), ...(p.id === w.key.nestle ? [['Milk received today', `${(w.ag.nestleMilkToday / 1000).toFixed(0)}k L`]] as [string, string][] : [])])}`;
    }
    el.innerHTML = html;
    el.hidden = false;
    el.querySelector('.close')?.addEventListener('click', () => this.select(null));
  }
}

function fmtPol(v: number): string {
  if (Math.abs(v) >= 1000) return `₹${v.toLocaleString('en-IN')}`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
