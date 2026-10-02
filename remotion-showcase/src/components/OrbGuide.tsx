// The Live Orb as a recurring guide. One orb travels the whole video: it
// notices the problem, absorbs the scattered tools, opens the dashboard, then
// moves between the metrics, channels, team and signals the viewer should read.
// Keyframes target named dashboard anchors; positions are resolved through the
// same camera maths as the stage, so the orb tracks cards while the camera moves.
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { useLayout } from '../lib/layout'
import { useReducedMotion } from '../lib/motion'
import { anchors, chartPoint, toScreen, type Orientation } from './dashboard/geometry'
import { DASH_TIMING } from './dashboard/ManagerDashboard'
import { LiveOrb } from './LiveOrb'
import { OPS_GEOMETRY } from './operations/geometry'

type Point = { x: number; y: number }
type Resolver = (frame: number) => Point
type Key = { f: number; at: Resolver; size: number; opacity?: number; lookAt?: Resolver }

const fixed = (x: number, y: number): Resolver => () => ({ x, y })

function chartHoverIndex(frame: number) {
  const h = DASH_TIMING.hover
  if (frame <= h[0][0]) return h[0][1]
  for (let i = 1; i < h.length; i++) if (frame < h[i][0]) return interpolate(frame, [h[i - 1][0], h[i][0]], [h[i - 1][1], h[i][1]], { easing: Easing.inOut(Easing.cubic) })
  return h[h.length - 1][1]
}

export function orbKeys(o: Orientation, width: number, height: number, reduced: boolean): Key[] {
  const a = anchors(o)
  const page = (pt: Point, dx = 0, dy = 0): Resolver => frame => { const s = toScreen(o, frame, pt, reduced); return { x: s.x + dx, y: s.y + dy } }
  const hover: Resolver = frame => { const s = toScreen(o, frame, chartPoint(o, chartHoverIndex(frame)), reduced); return { x: s.x, y: s.y - (o === 'desktop' ? 96 : 104) } }
  const hoverLook: Resolver = frame => toScreen(o, frame, chartPoint(o, chartHoverIndex(frame)), reduced)
  const c = { x: width / 2, y: o === 'desktop' ? height / 2 : 860 }
  const ops = OPS_GEOMETRY[o]
  const v = o === 'vertical'
  const brandSize = v ? 46 : 47
  return [
    // Scene 1: the orb arrives in the middle of the clutter and looks around.
    { f: 72, at: fixed(c.x, c.y), size: 64, opacity: 0, lookAt: fixed(c.x - 400, c.y - 200) },
    { f: 84, at: fixed(c.x, c.y), size: 84, opacity: 1, lookAt: fixed(c.x - 400, c.y - 200) },
    { f: 94, at: fixed(c.x, c.y), size: 88, lookAt: fixed(c.x + 420, c.y - 120) },
    { f: 104, at: fixed(c.x, c.y), size: 92, lookAt: fixed(c.x, c.y + 300) },
    // Scene 2: absorbs the windows, opens the dashboard, docks in the app.
    { f: 128, at: fixed(c.x, c.y), size: 150, lookAt: fixed(c.x, c.y + 40) },
    { f: 146, at: fixed(c.x, c.y), size: 150, lookAt: fixed(c.x, c.y + 40) },
    { f: 166, at: page(a.brandMark), size: brandSize, lookAt: page(a.targetRing) },
    { f: 170, at: page(a.brandMark), size: brandSize, opacity: 0, lookAt: page(a.targetRing) },
    // Scene 3: target, cards, then the chart tooltip.
    { f: 214, at: page(a.brandMark), size: brandSize, opacity: 0, lookAt: page(a.targetRing) },
    { f: 224, at: page(a.targetRing, -150, 4), size: 66, opacity: 1, lookAt: page(a.targetRing) },
    { f: 262, at: page(a.targetRing, -150, 4), size: 66, lookAt: page(a.targetTrack) },
    { f: 284, at: page(a.statGross, 20, -46), size: 62, lookAt: page(a.statProfit) },
    { f: 316, at: hover, size: 62, lookAt: hoverLook },
    { f: 360, at: hover, size: 62, lookAt: hoverLook },
    // Scene 4: channels arrive and combine.
    { f: 384, at: page(a.donut, v ? -190 : -200, v ? -40 : -40), size: 66, lookAt: page(a.legend) },
    { f: 420, at: page(a.donut, v ? -190 : -200, v ? -40 : -40), size: 66, lookAt: page(a.donut) },
    { f: 452, at: page(a.transactions, v ? -40 : -10, v ? -70 : -60), size: 60, lookAt: page(a.transactions, -300, 80) },
    // Scene 5: bridges the store tablet and the remote manager.
    { f: 478, at: fixed(ops.orb.x, ops.orb.y), size: ops.orbSize, lookAt: fixed(ops.tabletLook.x, ops.tabletLook.y) },
    { f: 522, at: fixed(ops.orb.x, ops.orb.y), size: ops.orbSize, lookAt: fixed(ops.tabletLook.x, ops.tabletLook.y) },
    { f: 532, at: fixed(ops.orb.x, ops.orb.y), size: ops.orbSize, lookAt: fixed(ops.managerLook.x, ops.managerLook.y) },
    { f: 566, at: fixed(ops.orb.x, ops.orb.y), size: ops.orbSize, lookAt: fixed(ops.stockLook.x, ops.stockLook.y) },
    { f: 594, at: fixed(ops.orb.x, ops.orb.y), size: ops.orbSize, lookAt: fixed(ops.stockLook.x, ops.stockLook.y) },
    // Scene 6: reads each signal, then the recommended actions.
    { f: 622, at: page(a.priorityHead), size: 58, lookAt: page(a.priorityRows[0]) },
    { f: 644, at: page(a.priorityHead), size: 58, lookAt: page(a.priorityRows[1]) },
    { f: 662, at: page(a.priorityHead), size: 58, lookAt: page(a.priorityRows[2]) },
    { f: 688, at: page(a.actionsHead), size: 58, lookAt: page(a.actionRows[0]) },
    { f: 708, at: page(a.actionsHead), size: 58, lookAt: page(a.actionRows[1]) },
    { f: 726, at: page(a.actionsHead), size: 58, lookAt: page(a.actionRows[2]) },
    { f: 750, at: page(a.actionsHead), size: 58, lookAt: page(a.actionRows[2]) },
    // Scene 7: centre stage, connects locations, then rests above the title.
    { f: 790, at: fixed(c.x, c.y), size: v ? 170 : 150, lookAt: fixed(c.x, c.y + 200) },
    { f: 826, at: fixed(c.x, c.y), size: v ? 170 : 150, lookAt: fixed(c.x, c.y + 200) },
    { f: 852, at: fixed(c.x, v ? 700 : 330), size: v ? 190 : 150, lookAt: fixed(c.x, v ? 1300 : 900) },
    { f: 900, at: fixed(c.x, v ? 700 : 330), size: v ? 190 : 150, lookAt: fixed(c.x, v ? 1300 : 900) },
  ]
}

/** Converts a direction on screen into the orb's gaze (y up, magnitude <= 0.85). */
function gaze(from: Point, to: Point): Point {
  const dx = (to.x - from.x) / 380
  const dy = -(to.y - from.y) / 380
  const m = Math.hypot(dx, dy)
  const k = m > 0.85 ? 0.85 / m : 1
  return { x: dx * k, y: dy * k }
}

export function OrbGuide() {
  const frame = useCurrentFrame()
  const layout = useLayout()
  const reduced = useReducedMotion()
  const o: Orientation = layout.isVertical ? 'vertical' : 'desktop'
  const keys = orbKeys(o, layout.width, layout.height, reduced)
  if (frame < keys[0].f || frame > keys[keys.length - 1].f) return null
  let i = 1
  while (i < keys.length - 1 && frame > keys[i].f) i++
  const a = keys[i - 1], b = keys[i]
  const t = reduced ? (frame >= b.f ? 1 : 0) : interpolate(frame, [a.f, b.f], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
  const pa = a.at(frame), pb = b.at(frame)
  const pos = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t }
  const size = a.size + (b.size - a.size) * t
  const opacity = (a.opacity ?? 1) + ((b.opacity ?? 1) - (a.opacity ?? 1)) * t
  const la = a.lookAt ? gaze(pos, a.lookAt(frame)) : { x: 0, y: 0.08 }
  const lb = b.lookAt ? gaze(pos, b.lookAt(frame)) : { x: 0, y: 0.08 }
  const look = { x: la.x + (lb.x - la.x) * t, y: la.y + (lb.y - la.y) * t }
  // A slow float keeps the orb alive while it waits; none with reduced motion.
  const bob = reduced ? 0 : Math.sin(frame / 22) * size * 0.035
  if (opacity <= 0.01) return null
  return (
    <div style={{ position: 'absolute', left: pos.x - size / 2, top: pos.y - size / 2 + bob, width: size, height: size, opacity, borderRadius: '50%', boxShadow: `0 ${size * 0.12}px ${size * 0.4}px rgba(0,0,0,0.16), 0 0 ${size * 0.45}px rgba(191,119,246,0.28), 0 0 0 1px rgba(255,255,255,0.9)` }}>
      <LiveOrb size={size} look={look} />
    </div>
  )
}
