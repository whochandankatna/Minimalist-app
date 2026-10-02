// Pure geometry for the manager dashboard "stage": where each real dashboard
// section sits (in app CSS pixels), where the device sits on screen, and how
// the camera moves. The Live Orb uses the same functions to find exactly where
// a card is on screen at any frame, so it can point at it in both formats.
import { Easing, interpolate } from 'remotion'
import { SERIES } from '../../data/sample'

export type Rect = { x: number; y: number; w: number; h: number }
export type Orientation = 'desktop' | 'vertical'

export type PageSpec = {
  width: number
  header: Rect
  sidebar: Rect | null
  toolbar: Rect
  target: Rect
  priority: Rect
  stats: Rect
  statColumns: number
  chart: Rect
  channels: Rect
  transactions: Rect
  people: Rect
  height: number
}

export const PAGE: Record<Orientation, PageSpec> = {
  desktop: {
    width: 1280,
    header: { x: 24, y: 20, w: 1232, h: 130 },
    sidebar: { x: 24, y: 170, w: 228, h: 840 },
    toolbar: { x: 272, y: 170, w: 984, h: 48 },
    target: { x: 272, y: 230, w: 520, h: 214 },
    priority: { x: 802, y: 230, w: 454, h: 214 },
    stats: { x: 272, y: 456, w: 984, h: 366 },
    statColumns: 3,
    chart: { x: 272, y: 834, w: 984, h: 318 },
    channels: { x: 272, y: 1164, w: 984, h: 300 },
    transactions: { x: 272, y: 1476, w: 984, h: 268 },
    people: { x: 272, y: 1756, w: 984, h: 230 },
    height: 2020,
  },
  vertical: {
    width: 760,
    header: { x: 20, y: 20, w: 720, h: 128 },
    sidebar: null,
    toolbar: { x: 20, y: 160, w: 720, h: 86 },
    target: { x: 20, y: 258, w: 720, h: 196 },
    priority: { x: 20, y: 466, w: 720, h: 214 },
    stats: { x: 20, y: 692, w: 720, h: 356 },
    statColumns: 3,
    chart: { x: 20, y: 1060, w: 720, h: 300 },
    channels: { x: 20, y: 1372, w: 720, h: 420 },
    transactions: { x: 20, y: 1804, w: 720, h: 268 },
    people: { x: 20, y: 2084, w: 720, h: 230 },
    height: 2340,
  },
}

/** Device placement on the video frame. `content` is the inner screen. */
export const STAGE: Record<Orientation, { device: Rect; content: Rect }> = {
  desktop: { device: { x: 640, y: 100, w: 1164, h: 880 }, content: { x: 640, y: 142, w: 1164, h: 838 } },
  vertical: { device: { x: 80, y: 600, w: 920, h: 940 }, content: { x: 98, y: 618, w: 884, h: 904 } },
}

export type Camera = { cx: number; cy: number; zoom: number }
type Key = { f: number } & Camera

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

function cameraKeys(o: Orientation): Key[] {
  const p = PAGE[o]
  const s = STAGE[o]
  const baseScale = s.content.w / p.width
  const visibleH = s.content.h / baseScale
  const top: Camera = { cx: p.width / 2, cy: visibleH / 2, zoom: 1 }
  const contentCx = p.toolbar.x + p.toolbar.w / 2
  if (o === 'desktop') {
    // Zoom 1.25 shows 1024 page px: exactly the content column, no sidebar slivers.
    const overview = { cx: contentCx + 8, cy: (p.target.y + p.stats.y + p.stats.h) / 2, zoom: 1.25 }
    const chart = { cx: contentCx + 8, cy: centre(p.chart).y, zoom: 1.25 }
    const channels = { cx: contentCx + 8, cy: (p.channels.y + p.transactions.y + p.transactions.h) / 2, zoom: 1.25 }
    const signals = { cx: 762, cy: 510, zoom: 1.28 }
    return [
      { f: 0, ...top }, { f: 214, ...top },
      { f: 244, ...overview }, { f: 292, ...overview },
      { f: 318, ...chart }, { f: 358, ...chart },
      { f: 384, ...channels }, { f: 470, ...channels },
      { f: 560, ...top }, { f: 598, ...top },
      { f: 626, ...signals }, { f: 752, ...signals },
      { f: 790, cx: top.cx, cy: top.cy, zoom: 0.92 },
    ]
  }
  const overview = { cx: p.width / 2, cy: (p.target.y + p.stats.y + p.stats.h) / 2 - 20, zoom: 0.98 }
  const chart = { cx: p.width / 2, cy: centre(p.chart).y + 40, zoom: 1.05 }
  const channels = { cx: p.width / 2, cy: centre(p.channels).y + 30, zoom: 1.0 }
  const signals = { cx: p.width / 2, cy: p.priority.y + 250, zoom: 1.0 }
  return [
    { f: 0, ...top }, { f: 214, ...top },
    { f: 244, ...overview }, { f: 292, ...overview },
    { f: 318, ...chart }, { f: 358, ...chart },
    { f: 384, ...channels }, { f: 470, ...channels },
    { f: 560, ...top }, { f: 598, ...top },
    { f: 626, ...signals }, { f: 752, ...signals },
    { f: 790, cx: top.cx, cy: top.cy, zoom: 0.9 },
  ]
}

const KEYS: Record<Orientation, Key[]> = { desktop: cameraKeys('desktop'), vertical: cameraKeys('vertical') }

export function cameraAt(o: Orientation, frame: number, reduced = false): Camera {
  const keys = KEYS[o]
  if (frame <= keys[0].f) return keys[0]
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i]
    if (frame <= b.f) {
      if (reduced) return frame < b.f ? a : b // cut instead of glide
      const t = interpolate(frame, [a.f, b.f], [0, 1], { easing: Easing.inOut(Easing.cubic) })
      return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, zoom: a.zoom + (b.zoom - a.zoom) * t }
    }
  }
  return keys[keys.length - 1]
}

export function stageScale(o: Orientation, cam: Camera) {
  return (STAGE[o].content.w / PAGE[o].width) * cam.zoom
}

/** Convert a point on the dashboard page (CSS px) to video-frame pixels. */
export function toScreen(o: Orientation, frame: number, point: { x: number; y: number }, reduced = false) {
  const cam = cameraAt(o, frame, reduced)
  const s = STAGE[o].content
  const scale = stageScale(o, cam)
  return { x: s.x + s.w / 2 + (point.x - cam.cx) * scale, y: s.y + s.h / 2 + (point.y - cam.cy) * scale, scale }
}

/** The recommended-actions panel shown in scene 6, in page coordinates. */
export const ACTIONS_RECT: Record<Orientation, Rect> = {
  desktop: { x: 286, y: 238, w: 500, h: 418 },
  vertical: { x: 20, y: 694, w: 720, h: 392 },
}

// ── Named anchors the Live Orb can visit ────────────────────────────────────
export function chartPoint(o: Orientation, index: number) {
  const c = PAGE[o].chart
  const plotW = c.w - 32 - 16
  const count = SERIES.length + 4
  return { x: c.x + 16 + 8 + (index / (count - 1)) * plotW, y: c.y + 70 }
}

export function anchors(o: Orientation) {
  const p = PAGE[o]
  const statW = (p.stats.w - (p.statColumns - 1) * 10) / p.statColumns
  return {
    brandMark: p.sidebar ? { x: p.sidebar.x + 44, y: p.sidebar.y + 40 } : { x: p.header.x + p.header.w - 36, y: p.header.y + 30 },
    targetRing: { x: p.target.x + p.target.w - 70, y: p.target.y + 96 },
    targetTrack: { x: p.target.x + p.target.w * 0.5, y: p.target.y + p.target.h - 52 },
    statGross: { x: p.stats.x + statW * 0.82, y: p.stats.y + 26 },
    statProfit: { x: p.stats.x + statW * 2 + 20 + statW * 0.82, y: p.stats.y + 136 },
    chart: { x: p.chart.x + p.chart.w * 0.5, y: p.chart.y + 40 },
    donut: o === 'desktop' ? { x: p.channels.x + 210, y: p.channels.y + 160 } : { x: p.channels.x + p.channels.w / 2, y: p.channels.y + 150 },
    legend: o === 'desktop' ? { x: p.channels.x + 520, y: p.channels.y + 90 } : { x: p.channels.x + 60, y: p.channels.y + 300 },
    transactions: { x: p.transactions.x + p.transactions.w - 80, y: p.transactions.y + 40 },
    // Centre of each channel logo in the legend (measured from renders).
    legendLogos: [0, 1, 2, 3].map(i => o === 'desktop' ? { x: 709, y: p.channels.y + 106 + i * 51 } : { x: p.channels.x + 46, y: p.channels.y + 296 + i * 30 }),
    priorityHead: { x: p.priority.x + p.priority.w - 34, y: p.priority.y + 30 },
    priorityRows: [0, 1, 2].map(i => ({ x: p.priority.x + 120, y: p.priority.y + 86 + i * 53 })),
    actionsHead: { x: ACTIONS_RECT[o].x + ACTIONS_RECT[o].w - 40, y: ACTIONS_RECT[o].y + 34 },
    actionRows: [0, 1, 2].map(i => ({ x: ACTIONS_RECT[o].x + ACTIONS_RECT[o].w * 0.45, y: ACTIONS_RECT[o].y + 108 + i * 78 })),
  }
}
