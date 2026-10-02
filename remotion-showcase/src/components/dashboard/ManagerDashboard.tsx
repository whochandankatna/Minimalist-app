// The manager Overview, rebuilt from the app's own markup and class names
// (ManagerSidebar and ManagerOverviewDashboard in src/App.tsx) so the vendored
// stylesheet renders it exactly as the app does. Every value is driven by the
// absolute frame so the camera can travel through one continuous dashboard.
import type { CSSProperties } from 'react'
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { CHANNELS, SUMMARY, TODAY, TODAY_CHANGE_PCT, TODAY_SUMMARY, TRANSACTIONS, YESTERDAY, formatMoney, statRows, type StatRow } from '../../data/sample'
import { useReducedMotion } from '../../lib/motion'
import { FONT_MONO, TOKENS } from '../../styles'
import { ChannelDonut } from '../charts/ChannelDonut'
import { SalesChart } from '../charts/SalesChart'
import { LiveOrb } from '../LiveOrb'
import { ACTIONS_RECT, PAGE, type Orientation, type Rect } from './geometry'
import { CheckIcon, NavIcon, SubIcon, type NavKey } from './icons'

// ── Timing (absolute frames in the 900-frame video) ─────────────────────────
export const DASH_TIMING = {
  navSequence: [[166, 'overview'], [175, 'finance'], [184, 'staff'], [193, 'stock'], [201, 'updates'], [208, 'settings'], [216, 'overview']] as [number, string][],
  todayAt: 220,
  sevenDayAt: 366,
  statsStart: 228,
  targetStart: 230,
  targetEnd: 292,
  chart: { actual: [292, 328], expenses: [300, 334], forecast: [322, 344] },
  hover: [[326, 0], [334, 3], [342, 5], [349, 6], [356, 7]] as [number, number][],
  compareAt: 344,
  channelGrow: 388,
  channelLegend: 372,
  logoArrive: [392, 400, 408, 416],
  channelActive: [[430, 0], [437, 1], [444, 2], [451, 3], [460, -1]] as [number, number][],
  transactions: 404,
  priorityActive: [[630, 0], [648, 1], [666, 2], [686, -1]] as [number, number][],
  actionsAt: 684,
  actionFocus: [[694, 0], [712, 1], [728, 2]] as [number, number][],
  actionDone: 706,
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const out = (frame: number, start: number, end: number) => interpolate(frame, [start, end], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
const stepAt = <T,>(frame: number, steps: [number, T][], fallback: T): T => {
  let value = fallback
  for (const [f, v] of steps) if (frame >= f) value = v
  return value
}

function place(rect: Rect, extra?: CSSProperties): CSSProperties {
  return { position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...extra }
}

const NAV: { key: NavKey; label: string; sub?: { key: string; label: string }[] }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'finance', label: 'Finance', sub: [{ key: 'sales', label: 'Sales' }, { key: 'cashPurchases', label: 'Cash purchases' }, { key: 'forecast', label: 'Forecast' }, { key: 'expenses', label: 'Expenses' }, { key: 'wages', label: 'Wages' }, { key: 'reviews', label: 'Reviews' }, { key: 'analytics', label: 'Analytics' }, { key: 'setup', label: 'Setup' }] },
  { key: 'staff', label: 'Staff', sub: [{ key: 'directory', label: 'Directory' }, { key: 'roster', label: 'Roster' }, { key: 'swaps', label: 'Swaps' }, { key: 'timeoff', label: 'Time Off' }, { key: 'training', label: 'Training' }, { key: 'clockouts', label: 'Clock-outs' }] },
  { key: 'updates', label: 'Updates' },
  { key: 'settings', label: 'Settings', sub: [{ key: 'categories', label: 'Categories' }, { key: 'roles', label: 'Roles' }, { key: 'alerts', label: 'Alerts' }, { key: 'location', label: 'Geolocation' }] },
]
const SECTIONS: { label: string; keys: NavKey[] }[] = [
  { label: 'Workspace', keys: ['overview', 'finance'] },
  { label: 'Management', keys: ['staff', 'updates'] },
  { label: 'System', keys: ['settings'] },
]

// ── Header and navigation ───────────────────────────────────────────────────
function AppHeader({ rect, highlight, orientation, showOrb }: { rect: Rect; highlight: string; orientation: Orientation; showOrb: boolean }) {
  const mono = (size: number, color: string): CSSProperties => ({ fontFamily: FONT_MONO, fontSize: size, letterSpacing: '0.22em', textTransform: 'uppercase', color })
  const glass: CSSProperties = { ...TOKENS.glass, borderRadius: 12 }
  const tabs: [string, string][] = [['overview', 'Overview'], ['stock', 'Stock Levels'], ['manager', 'Manager']]
  return (
    <header style={place(rect, { display: 'flex', flexDirection: 'column', gap: 12 })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 36 }}>
        <div style={mono(9, 'rgba(0,0,0,0.38)')}>Tropicool Treats</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...TOKENS.glass, borderRadius: 99, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: '#000' }} />
            <span style={{ ...mono(9, 'rgba(0,0,0,0.5)'), letterSpacing: '0.14em' }}>Fri, 02 Oct 2026</span>
          </div>
          {orientation === 'vertical' && <div style={{ width: 40, height: 40 }}>{showOrb && <LiveOrb size={40} look={{ x: -0.2, y: 0.1 }} blinkOffset={20} />}</div>}
          <div style={{ ...TOKENS.glass, borderRadius: 99, padding: '5px 10px 5px 5px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: 99, background: '#000', display: 'grid', placeItems: 'center', fontFamily: FONT_MONO, fontSize: 8, color: '#fff' }}>MG</div>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#000' }}>Manager</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 500, color: '#000', letterSpacing: '-0.025em', lineHeight: 1 }}>Manager</div>
      <div style={{ ...glass, padding: '4px 5px', display: 'flex', gap: 2 }}>
        {tabs.map(([key, label]) => {
          const active = key === 'manager'
          const flash = highlight === key && !active
          return (
            <span key={key} style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 8, background: active ? '#000' : flash ? TOKENS.lavenderSoft : 'transparent', boxShadow: flash ? `inset 0 0 0 1px ${TOKENS.lavenderLine}` : 'none', color: active ? '#fff' : flash ? '#111' : 'rgba(0,0,0,0.45)', fontWeight: active ? 500 : 400 }}>{label}</span>
          )
        })}
      </div>
    </header>
  )
}

function Sidebar({ rect, highlight, showOrb }: { rect: Rect; highlight: string; showOrb: boolean }) {
  return (
    <aside className="manager-desktop-sidebar" aria-label="Manager navigation" style={place(rect, { boxSizing: 'border-box' })}>
      <div className="manager-sidebar-brand">
        <span className="manager-sidebar-brand-mark">{showOrb ? <LiveOrb size={52} look={{ x: 0.25, y: 0.05 }} blinkOffset={40} /> : <span style={{ width: 52, height: 52 }} />}</span>
        <span className="manager-sidebar-brand-copy"><strong>Hello, Manager</strong><small>Manager workspace</small></span>
        <span className="manager-sidebar-toggle" aria-hidden>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m16 9-3 3 3 3" /></svg>
        </span>
      </div>
      <div className="manager-sidebar-sections sidebar-nav">
        {SECTIONS.map(section => (
          <section key={section.label} className="manager-sidebar-section">
            <div className="manager-sidebar-section-label">{section.label}</div>
            {section.keys.map(key => {
              const group = NAV.find(item => item.key === key)!
              const active = highlight === key
              return (
                <div key={key} className="manager-sidebar-group">
                  <button className={`manager-sidebar-button${active ? ' is-active' : ''}`}>
                    <span className="manager-sidebar-icon"><NavIcon kind={key} /></span>
                    <span className="manager-sidebar-label">{group.label}</span>
                    {group.sub && <span className="manager-sidebar-chevron is-open">›</span>}
                  </button>
                  {group.sub && (
                    <div className="manager-sidebar-subnav">
                      {group.sub.map(s => <button key={s.key}><SubIcon kind={s.key} /><span>{s.label}</span></button>)}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        ))}
      </div>
      <div className="manager-sidebar-status"><span className="manager-sidebar-status-dot" /><span>Manager mode</span></div>
    </aside>
  )
}

// ── Overview sections ───────────────────────────────────────────────────────
function Toolbar({ rect, range, switchProgress }: { rect: Rect; range: 'today' | '7d'; switchProgress: number }) {
  const options: ['today' | 'yesterday' | '7d' | 'thisMonth', string][] = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['thisMonth', 'This month']]
  return (
    <header className="cfo-toolbar dash4-toolbar" style={place(rect)}>
      <div><span>Business performance</span><small>Sales, costs, labour, channels and actions requiring attention</small></div>
      <div className="cfo-toolbar-actions">
        <div className="cfo-range-switch">
          {options.map(([key, label]) => <button key={key} className={range === key ? 'is-active' : ''} style={range === key ? { opacity: 0.55 + 0.45 * switchProgress } : undefined}>{label}</button>)}
        </div>
        <button className="cfo-refresh">Refresh</button>
      </div>
    </header>
  )
}

function TargetCard({ rect, gross, target, glow }: { rect: Rect; gross: number; target: number; glow: number }) {
  const pct = Math.round((gross / target) * 100)
  const colour = pct < 65 ? TOKENS.danger : pct < 80 ? TOKENS.warning : TOKENS.success
  const above = gross >= target
  return (
    <article className="cfo-target-card dash4-target-card" style={place(rect, { boxShadow: glow > 0 ? `0 0 ${40 * glow}px rgba(191,119,246,${0.25 * glow})` : undefined })}>
      <div className="cfo-card-eyebrow"><span>Sales target</span><b>Calculated</b></div>
      <div className="cfo-target-content">
        <div><strong>{formatMoney(gross)}</strong><small>of {formatMoney(target)} target</small></div>
        <div className="cfo-target-ring" style={{ '--cfo-progress': `${Math.min(100, pct)}%` } as CSSProperties}><span>{pct}%</span></div>
      </div>
      <div className="cfo-target-track"><i style={{ width: `${Math.min(100, pct)}%`, '--target-colour': colour } as CSSProperties} /></div>
      <div className="cfo-target-footer"><span>{above ? `${formatMoney(gross - target)} above target` : `${formatMoney(target - gross)} remaining`}</span><button>Edit target</button></div>
    </article>
  )
}

function PriorityCard({ rect, active }: { rect: Rect; active: number }) {
  const rows: [string, string][] = [['4', 'stock items need attention'], [String(SUMMARY.pendingTimeOff), 'time-off decisions pending'], [`${((SUMMARY.labourCost / SUMMARY.grossSales) * 100).toFixed(1)}%`, 'labour cost against sales']]
  return (
    <article className="cfo-panel dash4-actions-card dash4-priority-card" style={place(rect)}>
      <div className="cfo-panel-head"><div><span>Priority signals</span><small>Live</small></div><b>6</b></div>
      <div className="dash4-priority-list">
        {rows.map(([value, label], index) => (
          <button key={label} style={active === index ? { background: 'rgba(191,119,246,0.2)', boxShadow: `inset 0 0 0 1px rgba(216,201,255,0.55), 0 0 18px rgba(191,119,246,0.3)` } : undefined}>
            <strong>{value}</strong><span>{label}</span>
          </button>
        ))}
      </div>
    </article>
  )
}

function formatStat(row: StatRow, factor: number) {
  if (row.format === 'percent') return `${row.value.toFixed(1)}%`
  if (row.format === 'count') return String(Math.round(row.value * factor))
  return formatMoney(Math.round(row.value * factor))
}

function StatGrid({ rect, columns, range, frame, swap }: { rect: Rect; columns: number; range: 'today' | '7d'; frame: number; swap: number }) {
  const rows = statRows(range)
  return (
    <section className="dash4-stat-grid" aria-label="Detailed business summary" style={place(rect, { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 10, alignContent: 'start' })}>
      {rows.map((row, index) => {
        // In the Today view the figures climb from a mid-afternoon reading to the
        // latest total, showing the day developing. Rent is fixed per day.
        const climb = range === 'today' && row.label !== 'Allocated rent' && row.format !== 'percent'
        const p = out(frame, DASH_TIMING.statsStart + index * 3, DASH_TIMING.statsStart + 50 + index * 3)
        const factor = climb ? 0.72 + 0.28 * p : 1
        const updating = range === 'today' && p > 0 && p < 1
        return (
          <article key={row.label} className="dash4-stat-card" style={{ opacity: swap, boxShadow: updating ? `0 0 0 1px ${TOKENS.lavenderLine}, 0 6px 22px rgba(191,119,246,0.14)` : undefined }}>
            <div><span>{row.label}</span><b>{row.kind}</b></div>
            <strong>{formatStat(row, factor)}</strong>
            <small>{row.delta}</small>
          </article>
        )
      })}
    </section>
  )
}

function ChartPanel({ rect, frame, reduced }: { rect: Rect; frame: number; reduced: boolean }) {
  const t = DASH_TIMING
  const draw = reduced
    ? { actual: frame >= t.chart.actual[0] ? 1 : 0, expenses: frame >= t.chart.expenses[0] ? 1 : 0, forecast: frame >= t.chart.forecast[0] ? 1 : 0 }
    : { actual: out(frame, t.chart.actual[0], t.chart.actual[1]), expenses: out(frame, t.chart.expenses[0], t.chart.expenses[1]), forecast: out(frame, t.chart.forecast[0], t.chart.forecast[1]) }
  let hover: number | null = null
  if (frame >= t.hover[0][0]) {
    hover = t.hover[t.hover.length - 1][1]
    for (let i = 1; i < t.hover.length; i++) {
      const [f0, v0] = t.hover[i - 1], [f1, v1] = t.hover[i]
      if (frame < f1) { hover = reduced ? v0 : interpolate(frame, [f0, f1], [v0, v1], { ...clamp, easing: Easing.inOut(Easing.cubic) }); break }
    }
  }
  const tooltipOpacity = out(frame, t.hover[0][0], t.hover[0][0] + 6) * (1 - out(frame, 372, 380))
  const compare = out(frame, t.compareAt, t.compareAt + 12)
  return (
    <article className="cfo-panel cfo-trend-panel dash4-revenue-card" style={place(rect)}>
      <div className="cfo-panel-head"><div><span>Sales, forecast and expenses</span><small>Hover or tap the chart for daily values</small></div><button>Full analytics</button></div>
      <SalesChart width={rect.w - 34} draw={draw} hover={hover} tooltipOpacity={tooltipOpacity} />
      <div style={{ position: 'absolute', right: 130, top: 14, display: 'flex', gap: 6, opacity: compare, transform: `translateY(${reduced ? 0 : (1 - compare) * 6}px)` }}>
        {[['Today', formatMoney(TODAY.sales)], ['Yesterday', formatMoney(YESTERDAY.sales)]].map(([label, value]) => (
          <span key={label} style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', fontSize: 10.5, color: '#111', whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginRight: 6 }}>{label}</span>{value}
          </span>
        ))}
        <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(79,149,101,0.12)', border: '1px solid rgba(79,149,101,0.25)', color: '#2f6b43', fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.06em' }}>+{TODAY_CHANGE_PCT}%</span>
      </div>
    </article>
  )
}

function ChannelPanel({ rect, frame, orientation, reduced }: { rect: Rect; frame: number; orientation: Orientation; reduced: boolean }) {
  const t = DASH_TIMING
  const grow = CHANNELS.map((_, i) => reduced ? (frame >= t.logoArrive[i] ? 1 : 0) : out(frame, t.logoArrive[i], t.logoArrive[i] + 18))
  const centre = CHANNELS.reduce((sum, c, i) => sum + c.grossSales * grow[i], 0)
  const legend = CHANNELS.map((_, i) => out(frame, t.channelLegend + i * 5, t.channelLegend + 12 + i * 5))
  const logos = CHANNELS.map((_, i) => (frame >= t.logoArrive[i] ? 1 : 0))
  const active = stepAt(frame, t.channelActive, -1)
  const activeIndex = active >= 0 ? active : null
  return (
    <article className="cfo-panel cfo-channel-panel dash4-channel-card" style={place(rect)}>
      <div className="cfo-panel-head"><div><span>Revenue by channel</span><small>In-store and delivery, combined</small></div></div>
      <div style={{ padding: orientation === 'desktop' ? '6px 30px 0 30px' : '6px 14px 0' }}>
        <ChannelDonut grow={grow} active={activeIndex} centreValue={activeIndex == null ? centre : CHANNELS[activeIndex].grossSales} centreLabel={activeIndex == null ? 'All channels' : CHANNELS[activeIndex].channel} legend={legend} logoOpacity={logos} layout={orientation === 'desktop' ? 'row' : 'stack'} size={orientation === 'desktop' ? 220 : 200} />
      </div>
    </article>
  )
}

function TransactionsPanel({ rect, frame }: { rect: Rect; frame: number }) {
  return (
    <section className="cfo-panel cfo-transactions-panel" style={place(rect)}>
      <div className="cfo-panel-head"><div><span>Recent transactions</span><small>All recognised channels · Live feed</small></div><button>View all</button></div>
      <div className="cfo-transaction-table">
        <div className="cfo-transaction-header"><span>Time</span><span>Channel</span><span>Order</span><span>Status</span><span>Amount</span></div>
        {TRANSACTIONS.map((tx, index) => {
          const appear = out(frame, DASH_TIMING.transactions + index * 6, DASH_TIMING.transactions + 10 + index * 6)
          return (
            <button key={tx.order} type="button" style={{ opacity: appear }}>
              <span>{tx.time}</span><span>{tx.channel}</span><span>{tx.order}</span><span>COMPLETED</span><strong>{formatMoney(tx.amount)}</strong>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function PeoplePanel({ rect, orientation }: { rect: Rect; orientation: Orientation }) {
  const half = orientation === 'desktop' ? (rect.w - 10) / 2 : rect.w
  return (
    <div style={place(rect, { display: 'flex', gap: 10 })}>
      <article className="cfo-panel" style={{ width: half, boxSizing: 'border-box' }}>
        <div className="cfo-panel-head"><div><span>Working now</span><small>2 of 6 staff clocked in</small></div><button>Staff</button></div>
        <div className="cfo-staff-now">
          {[['JL', 'Jordan Lee', 'Shift Lead'], ['PS', 'Priya Shah', 'Front and Back House Team Member']].map(([avatar, name, role]) => (
            <button key={name}><span className="cfo-staff-avatar">{avatar}</span><div><strong>{name}</strong><small>{role}</small></div><b>On shift</b></button>
          ))}
        </div>
      </article>
      {orientation === 'desktop' && (
        <article className="cfo-panel dash4-forward-card" style={{ width: half, boxSizing: 'border-box' }}>
          <div className="cfo-panel-head"><div><span>Forward view</span><small>Forecast and committed costs</small></div><button>Forecast</button></div>
          <div className="cfo-forward-grid"><div><span>7-day forecast</span><strong>{formatMoney(SUMMARY.forecast7d)}</strong></div><div><span>Target variance</span><strong>{formatMoney(SUMMARY.grossSales - SUMMARY.salesTarget)}</strong></div></div>
        </article>
      )}
    </div>
  )
}

// ── Recommended actions (scene 6) ───────────────────────────────────────────
const ACTIONS = [
  { tag: 'Stock', title: 'Order 4 stock items before the weekend', detail: 'Raspberries and coconut yogurt are out · Weekend forecast $4,570.00', button: 'Create order list', done: 'Order list ready' },
  { tag: 'Staff', title: 'Decide 2 time-off requests', detail: 'Saturday cover stays at three staff if both are approved', button: 'Review requests' },
  { tag: 'Finance', title: 'Labour is 20.0% of sales', detail: 'Within the 30% guide · Room for one more Saturday shift', button: 'Open roster' },
]

function ActionsPanel({ rect, frame, reduced }: { rect: Rect; frame: number; reduced: boolean }) {
  const t = DASH_TIMING
  const enter = out(frame, t.actionsAt, t.actionsAt + 14)
  if (enter <= 0) return null
  const focus = stepAt(frame, t.actionFocus, -1)
  const done = frame >= t.actionDone
  return (
    <section className="cfo-overview-modal-card" style={place(rect, { boxSizing: 'border-box', width: rect.w, maxHeight: 'none', overflow: 'hidden', padding: 20, background: 'linear-gradient(145deg, rgba(255,255,255,0.97), rgba(238,236,241,0.95))', opacity: enter, transform: `translateY(${reduced ? 0 : (1 - enter) * 16}px) scale(${reduced ? 1 : 0.98 + 0.02 * enter})`, transformOrigin: 'top right' })}>
      <div className="cfo-overview-modal-head"><div><small>From live priority signals</small><span>Recommended next steps</span></div></div>
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {ACTIONS.map((action, index) => {
          const shown = out(frame, t.actionsAt + 6 + index * 5, t.actionsAt + 16 + index * 5)
          const focused = focus === index
          const isDone = index === 0 && done
          return (
            <div key={action.title} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 12, padding: '12px 12px 12px 14px', borderRadius: 14, background: focused ? 'rgba(180,156,255,0.13)' : 'rgba(255,255,255,0.5)', border: `1px solid ${focused ? 'rgba(180,156,255,0.32)' : 'rgba(255,255,255,0.9)'}`, opacity: shown, transform: `translateX(${reduced ? 0 : (1 - shown) * 12}px)` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.42)' }}>{action.tag}</div>
                <div style={{ fontSize: 13, color: '#111', marginTop: 5 }}>{action.title}</div>
                <div style={{ fontSize: 9.5, color: 'rgba(0,0,0,0.5)', marginTop: 3, lineHeight: 1.35 }}>{action.detail}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 13px', borderRadius: 999, whiteSpace: 'nowrap', fontFamily: FONT_MONO, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', background: isDone ? TOKENS.lavender : focused ? '#111' : 'transparent', color: isDone || focused ? '#fff' : '#111', border: isDone || focused ? '1px solid transparent' : '1px solid rgba(0,0,0,0.18)' }}>
                {isDone && <CheckIcon size={11} />}{isDone ? action.done : action.button}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Vertical-format bottom dock (the app's BottomMenu toolbar) ──────────────
export function ManagerDock({ highlight }: { highlight: string }) {
  const items: [NavKey, string][] = [['overview', 'Overview'], ['finance', 'Finance'], ['staff', 'Staff'], ['updates', 'Updates'], ['settings', 'Settings']]
  return (
    <div className="tt-app" style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center' }}>
      <div className="animated-bottom-menu-toolbar">
        {items.map(([key, label]) => (
          <button key={key} className={highlight === key ? 'is-current' : ''}><NavIcon kind={key} size={18} /><span>{label}</span></button>
        ))}
      </div>
    </div>
  )
}

export function navHighlight(frame: number) {
  return stepAt(frame, DASH_TIMING.navSequence, 'overview')
}

// ── Page ────────────────────────────────────────────────────────────────────
export function ManagerDashboard({ orientation, showSidebarOrb }: { orientation: Orientation; showSidebarOrb: boolean }) {
  const frame = useCurrentFrame()
  const reduced = useReducedMotion()
  const p = PAGE[orientation]
  const t = DASH_TIMING
  const highlight = navHighlight(frame)
  const range: 'today' | '7d' = frame >= t.todayAt && frame < t.sevenDayAt ? 'today' : '7d'
  // Brief dip in the card values when the range changes, like a data refresh.
  const sinceSwitch = Math.min(Math.abs(frame - t.todayAt), Math.abs(frame - t.sevenDayAt))
  const swap = reduced ? 1 : interpolate(sinceSwitch, [0, 8], [0.35, 1], clamp)
  const switchProgress = interpolate(sinceSwitch, [0, 8], [0, 1], clamp)
  const targetProgress = range === 'today' ? out(frame, t.targetStart, t.targetEnd) : 1
  const gross = range === 'today' ? Math.round(TODAY_SUMMARY.grossSales * (0.72 + 0.28 * targetProgress)) : SUMMARY.grossSales
  const target = range === 'today' ? TODAY_SUMMARY.salesTarget : SUMMARY.salesTarget
  const targetGlow = range === 'today' && frame >= t.targetStart ? interpolate(frame, [t.targetEnd - 6, t.targetEnd + 4, t.targetEnd + 30], [0, 1, 0], clamp) : 0
  const priorityActive = stepAt(frame, t.priorityActive, -1)
  const dim = out(frame, t.actionsAt - 4, t.actionsAt + 10) * 0.18 * (1 - out(frame, 760, 780))

  return (
    <div className="tt-app" style={{ position: 'relative', width: p.width, height: p.height }}>
      <AppHeader rect={p.header} highlight={highlight} orientation={orientation} showOrb={showSidebarOrb} />
      {p.sidebar && <Sidebar rect={p.sidebar} highlight={highlight} showOrb={showSidebarOrb} />}
      <div className="manager-page-content">
        <Toolbar rect={p.toolbar} range={range} switchProgress={switchProgress} />
        <div className="cfo-dashboard dashboard-four" style={{ display: 'contents' }}>
          <TargetCard rect={p.target} gross={gross} target={target} glow={targetGlow} />
          <PriorityCard rect={p.priority} active={priorityActive} />
          <StatGrid rect={p.stats} columns={p.statColumns} range={range} frame={frame} swap={swap} />
          <ChartPanel rect={p.chart} frame={frame} reduced={reduced} />
          <ChannelPanel rect={p.channels} frame={frame} orientation={orientation} reduced={reduced} />
          <TransactionsPanel rect={p.transactions} frame={frame} />
          <PeoplePanel rect={p.people} orientation={orientation} />
          {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(18,16,20,${dim})` }} />}
          <ActionsPanel rect={ACTIONS_RECT[orientation]} frame={frame} reduced={reduced} />
        </div>
      </div>
    </div>
  )
}
