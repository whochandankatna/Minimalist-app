// ILLUSTRATIVE SAMPLE DATA. Not live Tropicool Treats data.
//
// Financial figures mirror the sample dataset the app itself uses in draft
// mode (ManagerOverviewDashboard in src/App.tsx), so derived values such as
// labour %, gross profit and channel shares match what the real dashboard
// calculates. Staff names are invented. No PINs, credentials, customer details
// or real staff records appear anywhere in this project. See SAMPLE-DATA.md.

export const CURRENCY = 'AUD'

/** Values are in cents, matching the app's API. */
export const SUMMARY = {
  grossSales: 1_378_000,
  netSales: 1_329_800,
  discounts: 48_200,
  refunds: 12_600,
  orders: 412,
  previousGross: 1_246_000,
  labourCost: 276_000,
  productCogs: 347_600,
  cogsPercent: 27.1,
  cogsCoverage: 96.4,
  monthlyRent: 715_000,
  salesTarget: 1_200_000,
  forecast7d: 1_515_000,
  pendingTimeOff: 2,
}

// The sample period is the seven days ending Friday 2 October 2026.
export const SERIES = [
  { date: '2026-09-26', sales: 162_400, expenses: 61_000 },
  { date: '2026-09-27', sales: 188_900, expenses: 67_000 },
  { date: '2026-09-28', sales: 171_600, expenses: 72_000 },
  { date: '2026-09-29', sales: 224_300, expenses: 71_000 },
  { date: '2026-09-30', sales: 205_800, expenses: 74_000 },
  { date: '2026-10-01', sales: 193_700, expenses: 79_000 },
  { date: '2026-10-02', sales: 231_300, expenses: 76_000 },
]
export const FORECAST = [
  { date: '2026-10-03', sales: 219_000 },
  { date: '2026-10-04', sales: 238_000 },
  { date: '2026-10-05', sales: 244_000 },
  { date: '2026-10-06', sales: 226_000 },
]

export const CHANNELS = [
  { channel: 'Square POS', logo: 'brand/square-pos.png', grossSales: 794_600, orderCount: 241, kind: 'In-store' },
  { channel: 'Uber Eats', logo: 'brand/uber-eats.png', grossSales: 358_200, orderCount: 109, kind: 'Delivery' },
  { channel: 'Bopple', logo: 'brand/bopple.png', grossSales: 156_400, orderCount: 44, kind: 'Online ordering' },
  { channel: 'DoorDash', logo: 'brand/doordash.png', grossSales: 68_800, orderCount: 18, kind: 'Delivery' },
]

export const TRANSACTIONS = [
  { time: '4:03 pm', channel: 'Square POS', order: 'TT-9270', amount: 3_350 },
  { time: '3:44 pm', channel: 'Uber Eats', order: 'TT-9271', amount: 4_820 },
  { time: '3:25 pm', channel: 'Square POS', order: 'TT-9272', amount: 1_975 },
  { time: '3:06 pm', channel: 'Bopple', order: 'TT-9273', amount: 2_650 },
  { time: '2:47 pm', channel: 'Uber Eats', order: 'TT-9274', amount: 5_620 },
  { time: '2:28 pm', channel: 'DoorDash', order: 'TT-9275', amount: 2_240 },
]

/** Invented team members. Avatars are initials only. */
export const TEAM = [
  { name: 'Jordan Lee', avatar: 'JL', role: 'Shift Lead', scheduled: 6.0, actual: 6.2, status: 'On shift', since: '10:00 am' },
  { name: 'Priya Shah', avatar: 'PS', role: 'Front and Back House Team Member', scheduled: 5.0, actual: 4.9, status: 'On shift', since: '11:30 am' },
  { name: 'Sam Taylor', avatar: 'ST', role: 'Front and Back House Team Member', scheduled: 4.0, actual: 0, status: 'Clocking in', since: '3:58 pm' },
]
export const CLOCKOUT_REVIEW = { name: 'Mia Chen', rostered: '3:00 pm', automatic: '4:00 pm', corrected: '3:12 pm' }

// Product names come from the app's own draft stock list.
export const STOCK = [
  { name: 'Fresh Raspberries', category: 'Fridge', qty: 0, par: 4, unit: 'punnets', status: 'out' as const, important: true },
  { name: 'Cocobella Coconut Yogurt', category: 'Fridge', qty: 0, par: 2, unit: 'units', status: 'out' as const, important: true },
  { name: 'Fresh Strawberries', category: 'Fridge', qty: 6, par: 40, unit: 'kg', status: 'low' as const, important: true },
  { name: 'Nutella', category: 'Sauces', qty: 0.5, par: 4, unit: 'units', status: 'low' as const, important: false },
  { name: 'Frozen Mango', category: 'Freezer', qty: 7.5, par: 4, unit: 'kg', status: 'ok' as const, important: false },
]
export const OPENING_CHECKLIST = [
  'Turn on all sauce-warmer switches',
  'Lights on and music system active',
  'Acai machine wash cycle complete',
  'Acai bucket at 9°C to 10°C',
]

export const LOCATIONS = ['Flagship store', 'Second location', 'Delivery kitchen']

// ── Derived values, calculated the same way as the app ──────────────────────
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
export const ALLOCATED_RENT = Math.round(
  SERIES.reduce((sum, point) => {
    const d = new Date(`${point.date}T00:00:00Z`)
    return sum + SUMMARY.monthlyRent / daysInMonth(d.getUTCFullYear(), d.getUTCMonth())
  }, 0),
)
export const GROSS_PROFIT = SUMMARY.netSales - SUMMARY.productCogs
export const LABOUR_PCT = (SUMMARY.labourCost / SUMMARY.grossSales) * 100
export const TARGET_PCT = Math.round((SUMMARY.grossSales / SUMMARY.salesTarget) * 100)
export const CHANGE_PCT = Math.round(((SUMMARY.grossSales - SUMMARY.previousGross) / SUMMARY.previousGross) * 100)
export const AVERAGE_ORDER = Math.round(SUMMARY.netSales / SUMMARY.orders)
export const TODAY = SERIES[SERIES.length - 1]
export const YESTERDAY = SERIES[SERIES.length - 2]
export const TODAY_CHANGE_PCT = Math.round(((TODAY.sales - YESTERDAY.sales) / YESTERDAY.sales) * 100)
export const CHANNEL_TOTAL = CHANNELS.reduce((sum, c) => sum + c.grossSales, 0)

export function formatMoney(cents: number, fractionDigits = 2) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: CURRENCY, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(cents / 100)
}

export function formatDay(date: string, style: 'short' | 'long' = 'short') {
  const d = new Date(`${date}T00:00:00Z`)
  return d.toLocaleDateString('en-AU', style === 'short' ? { day: '2-digit', month: 'short', timeZone: 'UTC' } : { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
}

// ── "Today" view (Friday 2 October), derived from the same sample series ────
// Net sales use the app's sample rule (gross x 0.965) and order count comes from
// the app's sample series. Labour, refunds and the daily target are illustrative.
export const TODAY_SUMMARY = {
  grossSales: TODAY.sales,
  netSales: Math.round(TODAY.sales * 0.965),
  orders: 68,
  labourCost: 46_800,
  refunds: 2_100,
  salesTarget: 200_000, // the app's default daily target
  cogsPercent: 27.1,
  cogsCoverage: 96.4,
}
export const TODAY_COGS = Math.round(TODAY_SUMMARY.netSales * (TODAY_SUMMARY.cogsPercent / 100))
export const TODAY_RENT = Math.round(SUMMARY.monthlyRent / 31)

export type StatRow = { label: string; kind: 'Actual' | 'Calculated' | 'Estimated'; value: number; format: 'money' | 'count' | 'percent'; delta: string }

/** The nine Overview stat cards, in the app's order, for each range. */
export function statRows(range: 'today' | '7d'): StatRow[] {
  const s = range === 'today'
    ? { gross: TODAY_SUMMARY.grossSales, net: TODAY_SUMMARY.netSales, orders: TODAY_SUMMARY.orders, labour: TODAY_SUMMARY.labourCost, cogs: TODAY_COGS, rent: TODAY_RENT, refunds: TODAY_SUMMARY.refunds, change: TODAY_CHANGE_PCT }
    : { gross: SUMMARY.grossSales, net: SUMMARY.netSales, orders: SUMMARY.orders, labour: SUMMARY.labourCost, cogs: SUMMARY.productCogs, rent: ALLOCATED_RENT, refunds: SUMMARY.refunds, change: CHANGE_PCT }
  const profit = s.net - s.cogs
  const after = profit - s.labour - s.rent
  const labourPct = (s.labour / s.gross) * 100
  return [
    { label: 'Gross sales', kind: 'Actual', value: s.gross, format: 'money', delta: `+${s.change}% vs prior period` },
    { label: 'Net sales', kind: 'Actual', value: s.net, format: 'money', delta: `${formatMoney(s.gross - s.net)} discounts` },
    { label: 'Orders', kind: 'Actual', value: s.orders, format: 'count', delta: `${formatMoney(Math.round(s.net / s.orders))} average order` },
    { label: 'Labour cost', kind: 'Calculated', value: labourPct, format: 'percent', delta: formatMoney(s.labour) },
    { label: 'Product COGS', kind: 'Calculated', value: s.cogs, format: 'money', delta: '27.1% of mapped sales' },
    { label: 'Gross profit', kind: 'Estimated', value: profit, format: 'money', delta: 'Net sales less product COGS' },
    { label: 'Allocated rent', kind: 'Calculated', value: s.rent, format: 'money', delta: '$7,150 inc GST monthly · allocated by day' },
    { label: 'After labour and rent', kind: 'Estimated', value: after, format: 'money', delta: '96.4% COGS coverage' },
    { label: 'Refunds', kind: 'Actual', value: s.refunds, format: 'money', delta: `${((s.refunds / s.gross) * 100).toFixed(1)}% of gross sales` },
  ]
}
