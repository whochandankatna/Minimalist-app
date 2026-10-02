import type { CSSProperties, ReactNode } from 'react'
import { FONT_MONO } from '../styles'

export type DeviceKind = 'browser' | 'tablet' | 'phone'

type Props = {
  kind: DeviceKind
  width: number
  height: number
  children: ReactNode
  /** Optional label shown in the browser address bar or above other devices. */
  label?: string
  /** Subtle lavender outer glow, used to mark the device the viewer should watch. */
  glow?: number
  style?: CSSProperties
}

/** Bezel thickness per device, exported so stages can size their content. */
export const DEVICE_INSETS: Record<DeviceKind, { top: number; side: number; bottom: number; radius: number; innerRadius: number }> = {
  browser: { top: 42, side: 0, bottom: 0, radius: 22, innerRadius: 0 },
  tablet: { top: 18, side: 18, bottom: 18, radius: 40, innerRadius: 24 },
  phone: { top: 14, side: 14, bottom: 14, radius: 54, innerRadius: 42 },
}

/**
 * Frosted device frames in the app's visual language: soft white shells,
 * thin white borders and a quiet outer glow rather than glossy hardware.
 */
export function DeviceFrame({ kind, width, height, children, label, glow = 0, style }: Props) {
  const inset = DEVICE_INSETS[kind]
  const shadow = [
    '0 40px 90px rgba(0,0,0,0.16)',
    '0 12px 28px rgba(0,0,0,0.08)',
    'inset 0 1px 0 rgba(255,255,255,0.95)',
    glow > 0 ? `0 0 ${60 * glow}px rgba(191,119,246,${0.28 * glow})` : '',
  ].filter(Boolean).join(', ')
  return (
    <div style={{ position: 'absolute', width, height, borderRadius: inset.radius, background: kind === 'browser' ? 'rgba(248,248,248,0.86)' : 'rgba(250,250,250,0.78)', border: '1px solid rgba(255,255,255,0.92)', boxShadow: shadow, overflow: 'hidden', ...style }}>
      {kind === 'browser' && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: inset.top, display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.7)' }}>
          {[0, 1, 2].map(i => <span key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: 'rgba(0,0,0,0.12)' }} />)}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <div style={{ minWidth: 300, padding: '6px 18px', borderRadius: 999, background: 'rgba(0,0,0,0.045)', color: 'rgba(0,0,0,0.45)', font: `400 12px/1 ${FONT_MONO}`, letterSpacing: '0.04em', textAlign: 'center' }}>
              {label ?? 'Tropicool Treats Teams'}
            </div>
          </div>
          <span style={{ width: 49 }} />
        </div>
      )}
      <div style={{ position: 'absolute', top: inset.top, left: inset.side, right: inset.side, bottom: inset.bottom, borderRadius: inset.innerRadius, overflow: 'hidden', background: '#ececec' }}>
        {children}
      </div>
      {kind === 'phone' && <div style={{ position: 'absolute', top: inset.top + 12, left: '50%', width: 110, height: 30, marginLeft: -55, borderRadius: 999, background: '#0b0b0d' }} />}
    </div>
  )
}

/** Small mono label that names a device, e.g. "Store tablet" or "Manager · remote". */
export function DeviceTag({ text, style, live }: { text: string; style?: CSSProperties; live?: boolean }) {
  return (
    <div style={{ position: 'absolute', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.95)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', font: `400 15px/1 ${FONT_MONO}`, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.6)', ...style }}>
      {live && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#BF77F6', boxShadow: '0 0 10px rgba(191,119,246,0.8)' }} />}
      {text}
    </div>
  )
}
