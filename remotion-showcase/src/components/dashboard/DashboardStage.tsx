import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { useLayout } from '../../lib/layout'
import { useReducedMotion } from '../../lib/motion'
import { DeviceFrame } from '../DeviceFrame'
import { cameraAt, stageScale, STAGE, type Orientation } from './geometry'
import { ManagerDashboard, ManagerDock, navHighlight } from './ManagerDashboard'

type Props = {
  /** 0 to 1 circular reveal growing out of the Live Orb. */
  reveal: number
  /** Screen point the reveal grows from (the orb's position). */
  revealOrigin: { x: number; y: number }
  opacity: number
  /** Extra scale applied to the whole device, for entrances and exits. */
  deviceScale?: number
  showSidebarOrb: boolean
  glow?: number
}

/**
 * The manager dashboard inside a device frame, viewed through a camera that
 * pans and zooms across one continuous page.
 */
export function DashboardStage({ reveal, revealOrigin, opacity, deviceScale = 1, showSidebarOrb, glow = 0 }: Props) {
  const frame = useCurrentFrame()
  const layout = useLayout()
  const reduced = useReducedMotion()
  const o: Orientation = layout.isVertical ? 'vertical' : 'desktop'
  const { device, content } = STAGE[o]
  const cam = cameraAt(o, frame, reduced)
  const scale = stageScale(o, cam)
  const tx = content.w / 2 - cam.cx * scale
  const ty = content.h / 2 - cam.cy * scale
  // The reveal is a circle that grows from the orb until it covers the device.
  const maxRadius = Math.hypot(layout.width, layout.height)
  const radius = interpolate(reveal, [0, 1], [0, maxRadius])
  const clip = reveal >= 1 ? undefined : `circle(${radius}px at ${revealOrigin.x}px ${revealOrigin.y}px)`
  if (opacity <= 0 || reveal <= 0) return null
  return (
    <AbsoluteFill style={{ opacity, clipPath: clip, WebkitClipPath: clip }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${deviceScale})`, transformOrigin: `${device.x + device.w / 2}px ${device.y + device.h / 2}px` }}>
        <DeviceFrame kind={o === 'desktop' ? 'browser' : 'tablet'} width={device.w} height={device.h} label="tropicooltreatsteam.netlify.app · Manager" glow={glow} style={{ left: device.x, top: device.y }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #f3f3f3 0%, #e5e5e5 60%, #d9d9d9 100%)' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0' }}>
            <ManagerDashboard orientation={o} showSidebarOrb={showSidebarOrb} />
          </div>
          {o === 'vertical' && <ManagerDock highlight={navHighlight(frame)} />}
        </DeviceFrame>
      </div>
    </AbsoluteFill>
  )
}
