// Scene 7: one or many locations feed the same operating view, then the brand
// lockup and core message. Location figures are illustrative.
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { CLOSING_AUDIENCE, COPY, PRODUCT_NAME, PRODUCT_SUBTITLE } from '../../config/copy'
import { LOCATIONS, formatMoney } from '../../data/sample'
import { useLayout } from '../../lib/layout'
import { useReducedMotion } from '../../lib/motion'
import { FONT_MONO, FONT_SANS, TOKENS } from '../../styles'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const out = (frame: number, a: number, b: number) => interpolate(frame, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })

const LOCATION_SALES = [1_378_000, 964_000, 621_000]
export const LOCATIONS_TOTAL = LOCATION_SALES.reduce((sum, v) => sum + v, 0)

export const CLOSING_TIMING = { locations: 794, linesDone: 822, locationsOut: 842, lockup: 852, tagline: 862, audience: 876 }

export function Closing() {
  const frame = useCurrentFrame()
  const layout = useLayout()
  const reduced = useReducedMotion()
  const T = CLOSING_TIMING
  const v = layout.isVertical
  const centre = { x: layout.width / 2, y: v ? 860 : 540 }
  const cards = v
    ? [{ x: 540, y: 560 }, { x: 290, y: 1170 }, { x: 790, y: 1170 }]
    : [{ x: 520, y: 360 }, { x: 1400, y: 360 }, { x: 960, y: 820 }]
  const cardW = v ? 300 : 320
  const locationsVisible = out(frame, T.locations, T.locations + 14) * (1 - out(frame, T.locationsOut, T.locationsOut + 12))
  const total = LOCATION_SALES.reduce((sum, value, i) => sum + value * out(frame, T.locations + 10 + i * 6, T.linesDone + i * 4), 0)
  const lockup = out(frame, T.lockup, T.lockup + 16)
  const tagline = COPY.close.lines
  const lift = (p: number, px = 18) => `translateY(${reduced ? 0 : (1 - p) * px}px)`

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {locationsVisible > 0 && (
        <>
          <svg width={layout.width} height={layout.height} style={{ position: 'absolute', inset: 0, opacity: locationsVisible }}>
            {cards.map((c, i) => {
              const draw = out(frame, T.locations + 6 + i * 6, T.linesDone + i * 4)
              const len = Math.hypot(c.x - centre.x, c.y - centre.y)
              return <line key={i} x1={centre.x} y1={centre.y} x2={c.x} y2={c.y} stroke={TOKENS.lavender} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray={`${len}`} strokeDashoffset={len * (1 - draw)} />
            })}
          </svg>
          {cards.map((c, i) => {
            const p = out(frame, T.locations + i * 6, T.locations + 16 + i * 6)
            return (
              <div key={LOCATIONS[i]} style={{ position: 'absolute', left: c.x - cardW / 2, top: c.y - 52, width: cardW, boxSizing: 'border-box', padding: '16px 20px', borderRadius: 18, ...TOKENS.glass, background: 'rgba(255,255,255,0.78)', opacity: p * locationsVisible, transform: lift(p) }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }}>{LOCATIONS[i]}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 30, color: '#111', marginTop: 10 }}>{formatMoney(LOCATION_SALES[i])}</div>
              </div>
            )
          })}
          <div style={{ position: 'absolute', left: centre.x - 160, width: 320, top: centre.y + (v ? 120 : 100), textAlign: 'center', opacity: locationsVisible * out(frame, T.locations + 12, T.locations + 24) }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: v ? 16 : 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }}>All locations · 7 days</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: v ? 40 : 34, color: '#111', marginTop: 8 }}>{formatMoney(Math.round(total))}</div>
          </div>
        </>
      )}
      {lockup > 0 && (
        <div style={{ position: 'absolute', left: layout.safe.left, right: layout.safe.right, top: v ? 900 : 450, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: v ? 22 : 20, opacity: lockup, transform: lift(lockup) }}>
            <Img src={staticFile('brand/app-icon-512.png')} style={{ width: v ? 84 : 68, height: v ? 84 : 68, borderRadius: v ? 20 : 16, boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.8)' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ font: `400 ${v ? 50 : 44}px/1 ${FONT_SANS}`, letterSpacing: '-0.02em', color: '#111' }}>{PRODUCT_NAME}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: v ? 17 : 14, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', marginTop: 10 }}>{PRODUCT_SUBTITLE}</div>
            </div>
          </div>
          <div style={{ marginTop: v ? 70 : 52 }}>
            {tagline.map((line, i) => {
              const p = out(frame, T.tagline + i * 7, T.tagline + 16 + i * 7)
              return <div key={line} style={{ font: `300 ${v ? 76 : 64}px/1.1 ${FONT_SANS}`, letterSpacing: '-0.03em', color: i === 0 ? '#111' : 'rgba(17,17,17,0.55)', opacity: p, transform: lift(p, 24) }}>{line}</div>
            })}
          </div>
          <div style={{ marginTop: v ? 48 : 36, fontFamily: FONT_MONO, fontSize: v ? 17 : 15, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', opacity: out(frame, T.audience, T.audience + 14), maxWidth: v ? 800 : 1000, lineHeight: 1.5 }}>{CLOSING_AUDIENCE}</div>
        </div>
      )}
    </div>
  )
}
