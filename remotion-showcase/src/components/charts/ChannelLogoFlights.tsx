// Scene 4: the real channel logos (transparent PNGs from the app's
// public/channel-logos) float in as cutouts over the dashboard, then fly into
// their legend rows, where the legend's own logo takes over.
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { CHANNELS } from '../../data/sample'
import { useLayout } from '../../lib/layout'
import { useReducedMotion } from '../../lib/motion'
import { anchors, toScreen, type Orientation } from '../dashboard/geometry'
import { DASH_TIMING } from '../dashboard/ManagerDashboard'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export function ChannelLogoFlights() {
  const frame = useCurrentFrame()
  const layout = useLayout()
  const reduced = useReducedMotion()
  const o: Orientation = layout.isVertical ? 'vertical' : 'desktop'
  if (frame < 360 || frame > DASH_TIMING.logoArrive[3] + 1) return null
  const slots = anchors(o).legendLogos
  // Where each cutout first appears, in video pixels.
  const starts = o === 'desktop'
    ? [{ x: 1300, y: 300 }, { x: 1470, y: 250 }, { x: 1640, y: 300 }, { x: 1770, y: 380 }]
    : [{ x: 220, y: 520 }, { x: 420, y: 520 }, { x: 620, y: 520 }, { x: 820, y: 520 }]
  const bigSize = o === 'desktop' ? 112 : 120
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {CHANNELS.map((channel, i) => {
        const arrive = DASH_TIMING.logoArrive[i]
        const appearAt = 360 + i * 5
        if (frame >= arrive) return null
        const appear = interpolate(frame, [appearAt, appearAt + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
        const fly = reduced ? 0 : interpolate(frame, [arrive - 13, arrive], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) })
        const slot = toScreen(o, frame, slots[i], reduced)
        const slotSize = 20 * slot.scale
        const float = reduced ? 0 : Math.sin((frame + i * 9) / 14) * 5 * (1 - fly)
        const x = starts[i].x + (slot.x - starts[i].x) * fly
        const y = starts[i].y + float + (slot.y - starts[i].y) * fly
        const size = bigSize + (slotSize - bigSize) * fly
        return (
          <Img key={channel.channel} src={staticFile(channel.logo)} style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, objectFit: 'contain', opacity: appear, filter: `drop-shadow(0 ${10 * (1 - fly)}px ${18 * (1 - fly)}px rgba(0,0,0,${0.18 * (1 - fly)}))` }} />
        )
      })}
    </div>
  )
}
