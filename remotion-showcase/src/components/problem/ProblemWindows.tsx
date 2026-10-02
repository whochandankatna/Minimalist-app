// Scene 1 and the start of scene 2: eight disconnected tools drift together and
// overlap, showing duplicated and conflicting figures, then collapse into the
// Live Orb. Motion stays slow and controlled: no spinning, no shaking.
import type { CSSProperties, ReactNode } from 'react'
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { useLayout } from '../../lib/layout'
import { useReducedMotion } from '../../lib/motion'
import { FONT_MONO, FONT_SANS } from '../../styles'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const mono = (size: number, extra?: CSSProperties): CSSProperties => ({ fontFamily: FONT_MONO, fontSize: size, letterSpacing: '0.1em', textTransform: 'uppercase', ...extra })

type Kind = 'sheet' | 'list' | 'bars' | 'calendar'
type Figure = { label: string; value: string; flag?: 'duplicate' | 'conflict' }
type WindowSpec = {
  title: string
  kind: Kind
  badge: number
  figures: Figure[]
  /** Start and settled positions as fractions of the scene area (centre of window). */
  from: [number, number]
  to: [number, number]
  tilt: number
}

// Figures are deliberately repeated or slightly different across tools.
const WINDOWS: WindowSpec[] = [
  { title: 'Sales', kind: 'sheet', badge: 3, figures: [{ label: 'Gross sales', value: '$13,780.00', flag: 'conflict' }, { label: 'Uber Eats', value: '$3,582.00', flag: 'duplicate' }], from: [0.16, 0.2], to: [0.3, 0.32], tilt: -1.5 },
  { title: 'Staff scheduling', kind: 'calendar', badge: 2, figures: [{ label: 'Rostered', value: '41.5 h' }], from: [0.84, 0.16], to: [0.66, 0.28], tilt: 1.2 },
  { title: 'Inventory', kind: 'list', badge: 4, figures: [{ label: 'Low items', value: '4' }], from: [0.12, 0.78], to: [0.33, 0.66], tilt: 1 },
  { title: 'Payroll', kind: 'sheet', badge: 1, figures: [{ label: 'Labour', value: '$2,760.00', flag: 'duplicate' }], from: [0.88, 0.82], to: [0.68, 0.7], tilt: -1.2 },
  { title: 'Expenses', kind: 'sheet', badge: 5, figures: [{ label: 'Wages', value: '$2,760.00', flag: 'duplicate' }], from: [0.5, 0.06], to: [0.5, 0.24], tilt: 0.6 },
  { title: 'Delivery platforms', kind: 'list', badge: 7, figures: [{ label: 'Uber Eats', value: '$3,582.00', flag: 'duplicate' }], from: [0.04, 0.48], to: [0.22, 0.5], tilt: -0.8 },
  { title: 'Forecasting', kind: 'bars', badge: 1, figures: [{ label: 'Next 7 days', value: '$15,150.00' }], from: [0.96, 0.5], to: [0.79, 0.5], tilt: 0.9 },
  { title: 'Reports', kind: 'sheet', badge: 2, figures: [{ label: 'Gross sales', value: '$13,870.00', flag: 'conflict' }], from: [0.5, 0.94], to: [0.52, 0.76], tilt: -0.6 },
]

function Body({ kind }: { kind: Kind }) {
  if (kind === 'sheet') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 1, background: 'rgba(0,0,0,0.06)', borderRadius: 6, overflow: 'hidden', marginTop: 10 }}>
        {Array.from({ length: 16 }, (_, i) => <span key={i} style={{ height: 13, background: i < 4 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.85)' }} />)}
      </div>
    )
  }
  if (kind === 'calendar') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginTop: 10 }}>
        {Array.from({ length: 14 }, (_, i) => <span key={i} style={{ height: 14, borderRadius: 3, background: [1, 3, 4, 8, 10, 12].includes(i) ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.06)' }} />)}
      </div>
    )
  }
  if (kind === 'bars') {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 40, marginTop: 10 }}>
        {[0.5, 0.62, 0.55, 0.8, 0.72, 0.9, 0.85].map((h, i) => <span key={i} style={{ flex: 1, height: `${h * 100}%`, borderRadius: 3, background: i > 4 ? 'rgba(191,119,246,0.5)' : 'rgba(0,0,0,0.16)' }} />)}
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 5, marginTop: 10 }}>
      {[0.8, 0.62, 0.7].map((w, i) => <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'rgba(0,0,0,0.15)' }} /><span style={{ height: 6, width: `${w * 100}%`, borderRadius: 3, background: 'rgba(0,0,0,0.09)' }} /></div>)}
    </div>
  )
}

function ToolWindow({ spec, highlight, children }: { spec: WindowSpec; highlight: number; children: ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 18, background: 'rgba(255,255,255,0.74)', border: '1px solid rgba(255,255,255,0.95)', boxShadow: '0 24px 60px rgba(0,0,0,0.12), inset 0 1px 0 #fff', padding: '12px 16px 14px', fontFamily: FONT_SANS, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {[0, 1, 2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(0,0,0,0.13)' }} />)}
        <span style={{ marginLeft: 8, fontSize: 15, color: '#111' }}>{spec.title}</span>
      </div>
      {spec.figures.map(f => (
        <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, padding: '4px 6px', marginInline: -6, borderRadius: 8, background: f.flag ? `rgba(${f.flag === 'conflict' ? '201,79,79' : '180,156,255'},${0.14 * highlight})` : undefined, boxShadow: f.flag ? `inset 0 0 0 1px rgba(${f.flag === 'conflict' ? '201,79,79' : '180,156,255'},${0.45 * highlight})` : undefined }}>
          <span style={mono(9, { color: 'rgba(0,0,0,0.45)' })}>{f.label}</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 15, color: '#111' }}>{f.value}</span>
        </div>
      ))}
      {children}
      <span style={{ position: 'absolute', top: -9, right: -9, minWidth: 26, height: 26, padding: '0 7px', boxSizing: 'border-box', borderRadius: 999, background: '#111', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FONT_MONO, fontSize: 12, boxShadow: '0 0 0 3px rgba(255,255,255,0.9)' }}>{spec.badge}</span>
    </div>
  )
}

export function ProblemWindows({ collapseTo }: { collapseTo: { x: number; y: number } }) {
  const frame = useCurrentFrame()
  const layout = useLayout()
  const reduced = useReducedMotion()
  // Scene area the windows occupy, clear of the caption.
  const area = layout.pick({ x: 560, y: 70, w: 1300, h: 940 }, { x: 40, y: 540, w: 1000, h: 1000 })
  const size = layout.pick({ w: 300, h: 150 }, { w: 330, h: 160 })
  const highlight = interpolate(frame, [52, 64, 100, 108], [0, 1, 1, 0.6], clamp)
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {WINDOWS.map((spec, index) => {
        const enterAt = 4 + index * 5
        const enter = interpolate(frame, [enterAt, enterAt + 16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
        // Windows drift towards each other for the whole scene, so the overlap grows.
        const drift = reduced ? 1 : interpolate(frame, [enterAt, 104], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) })
        const fx = spec.from[0] + (spec.to[0] - spec.from[0]) * drift
        const fy = spec.from[1] + (spec.to[1] - spec.from[1]) * drift
        // Keep every window fully on screen in both formats.
        const margin = 28
        let x = Math.min(layout.width - size.w / 2 - margin, Math.max(size.w / 2 + margin, area.x + fx * area.w))
        let y = Math.min(layout.height - size.h / 2 - margin, Math.max(size.h / 2 + margin, area.y + fy * area.h))
        const collapseStart = 108 + index * 2
        const collapse = interpolate(frame, [collapseStart, collapseStart + 22], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) })
        x += (collapseTo.x - x) * collapse
        y += (collapseTo.y - y) * collapse
        const scale = (reduced ? 1 : 0.94 + 0.06 * enter) * (1 - 0.94 * collapse)
        const opacity = enter * (1 - interpolate(collapse, [0.6, 1], [0, 1], clamp))
        if (opacity <= 0) return null
        return (
          <div key={spec.title} style={{ position: 'absolute', left: x - size.w / 2, top: y - size.h / 2, width: size.w, height: size.h, opacity, transform: `scale(${scale}) rotate(${reduced ? 0 : spec.tilt * (1 - collapse)}deg)`, zIndex: index }}>
            <ToolWindow spec={spec} highlight={highlight}>
              <Body kind={spec.kind} />
            </ToolWindow>
          </div>
        )
      })}
    </div>
  )
}
