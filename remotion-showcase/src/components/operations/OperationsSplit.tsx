// Scene 5: a team member clocks in on the store tablet while the manager's
// remote view updates. The clock card follows the app's ClockSection and
// SwipeToConfirm markup (including the real border-beam class); the manager
// side uses the app's panel classes.
import type { CSSProperties, ReactNode } from 'react'
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { CLOCKOUT_REVIEW, OPENING_CHECKLIST, STOCK, TEAM } from '../../data/sample'
import { useLayout } from '../../lib/layout'
import { useReducedMotion } from '../../lib/motion'
import { FONT_MONO, TOKENS } from '../../styles'
import { CheckIcon, ChevronsIcon } from '../dashboard/icons'
import { DeviceFrame, DeviceTag } from '../DeviceFrame'
import { OPS_GEOMETRY, OPS_TIMING as T } from './geometry'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const out = (frame: number, a: number, b: number) => interpolate(frame, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
const mono = (size: number, extra?: CSSProperties): CSSProperties => ({ fontFamily: FONT_MONO, fontSize: size, letterSpacing: '0.14em', textTransform: 'uppercase', ...extra })
const glass: CSSProperties = { ...TOKENS.glass }
const PURPLE = TOKENS.lavender

/** Dotted rotating sphere, standing in for the app's "gyro" thinking orb. */
function DotSphere({ size, frame, reduced }: { size: number; frame: number; reduced: boolean }) {
  const spin = reduced ? 0.6 : frame * 0.035
  const dots: ReactNode[] = []
  for (let lat = -75; lat <= 75; lat += 15) {
    const ring = Math.cos((lat * Math.PI) / 180)
    const count = Math.max(4, Math.round(16 * ring))
    for (let k = 0; k < count; k++) {
      const lon = (k / count) * Math.PI * 2 + spin
      const x = Math.sin(lon) * ring, z = Math.cos(lon) * ring, y = Math.sin((lat * Math.PI) / 180)
      if (z < -0.15) continue
      const depth = (z + 1) / 2
      dots.push(<circle key={`${lat}-${k}`} cx={50 + x * 44} cy={50 - y * 44} r={0.9 + depth * 1.6} fill="#000" opacity={0.25 + depth * 0.75} />)
    }
  }
  return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>{dots}</svg>
}

function ClockCard({ frame, reduced, compact }: { frame: number; reduced: boolean; compact: boolean }) {
  const slide = reduced ? (frame >= T.slide[1] ? 1 : 0) : interpolate(frame, T.slide, [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) })
  const feedback = frame >= T.success ? 'success' : frame >= T.pending ? 'pending' : 'idle'
  const dragging = frame >= T.slide[0] && frame < T.pending
  const trackW = compact ? 300 : 320
  const thumb = 52
  const dragX = feedback === 'idle' ? slide * (trackW - thumb) : trackW - thumb
  const geofence = out(frame, T.geofence, T.geofence + 10)
  const clockedIn = feedback === 'success'
  const beamAngle = feedback === 'pending' ? -90 + (frame - T.pending) * 34 : -90 + slide * 300
  const beamOpacity = feedback === 'idle' ? (dragging ? Math.min(1, 0.25 + slide) : 0) : feedback === 'pending' ? 1 : Math.max(0, 1 - (frame - T.success) / 12)
  const member = TEAM[2]
  return (
    <div style={{ ...glass, borderRadius: 24, padding: compact ? '18px 24px' : '30px 24px', display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', gap: compact ? 26 : 16, width: compact ? 640 : 380 }}>
      <div style={{ width: compact ? 112 : 132, height: compact ? 112 : 132, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'rgba(255,255,255,0.36)', border: '1px solid rgba(255,255,255,0.72)', boxShadow: 'inset 0 0 32px rgba(255,255,255,0.5), 0 18px 44px rgba(0,0,0,0.08)' }}>
        <DotSphere size={compact ? 52 : 60} frame={frame} reduced={reduced} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: compact ? 'flex-start' : 'center', gap: 14 }}>
        <div style={{ textAlign: compact ? 'left' : 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#000' }}>{member.name}</div>
          <div style={mono(10, { color: 'rgba(0,0,0,0.4)', marginTop: 6, letterSpacing: '0.16em' })}>{clockedIn ? `Clocked in ${member.since}` : 'Not clocked in · Shift 4:00 pm'}</div>
        </div>
        <div className={`clock-swipe-track clock-swipe-${feedback}${dragging ? ' clock-swipe-dragging' : ''}`} style={{ position: 'relative', width: trackW, height: thumb, borderRadius: 99, background: feedback === 'success' ? PURPLE : '#000' }}>
          <span className={`clock-border-beam clock-border-beam-${feedback}`} aria-hidden style={{ '--clock-beam-angle': `${beamAngle}deg`, '--clock-beam-opacity': beamOpacity, opacity: beamOpacity } as CSSProperties} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: 99, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: feedback === 'idle' ? Math.max(0, 1 - slide * 1.6) : 1 }}>
            <span style={mono(10.5, { color: 'rgba(255,255,255,0.82)' })}>{feedback === 'success' ? 'Clocked in' : feedback === 'pending' ? 'Clocking in…' : 'Slide to clock in'}</span>
          </div>
          <div style={{ position: 'absolute', top: 2, left: 2, width: thumb - 4, height: thumb - 4, borderRadius: 99, background: '#fff', display: 'grid', placeItems: 'center', transform: `translateX(${dragX}px) scale(${feedback === 'success' ? 1.08 : 1})`, boxShadow: '0 2px 8px rgba(0,0,0,0.25)', zIndex: 4 }}>
            {feedback === 'success' ? <CheckIcon size={20} strokeWidth={2.8} /> : feedback === 'pending' ? <DotSphere size={22} frame={frame * 3} reduced={reduced} /> : <ChevronsIcon />}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: geofence, padding: '7px 12px', borderRadius: 99, background: 'rgba(79,149,101,0.1)', border: '1px solid rgba(79,149,101,0.22)', color: '#2f6b43' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
          <span style={mono(8.5, { letterSpacing: '0.1em' })}>Inside 200 m store radius</span>
        </div>
      </div>
    </div>
  )
}

function StoreTablet({ frame, reduced, vertical }: { frame: number; reduced: boolean; vertical: boolean }) {
  const reminder = out(frame, T.reminder, T.reminder + 10) * (1 - out(frame, T.success - 2, T.success + 8))
  return (
    <div className="tt-app" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #f4f4f4 0%, #e4e4e4 65%, #d6d6d6 100%)', fontFamily: '"Outfit", sans-serif' }}>
      <div style={{ position: 'absolute', left: 26, top: 22, right: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={mono(9, { letterSpacing: '0.22em', color: 'rgba(0,0,0,0.38)' })}>Tropicool Treats</div>
          <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.025em', marginTop: 8 }}>Team</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: vertical ? 92 : 150, display: 'flex', justifyContent: 'center' }}>
        <ClockCard frame={frame} reduced={reduced} compact />
      </div>
      {/* Shift reminder, as delivered by the app's clock-in reminders. */}
      <div style={{ position: 'absolute', right: 22, top: 18, opacity: reminder, transform: `translateY(${reduced ? 0 : (1 - reminder) * -10}px)`, ...glass, background: 'rgba(255,255,255,0.86)', borderRadius: 14, padding: '10px 14px', width: 250 }}>
        <div style={mono(8, { color: 'rgba(0,0,0,0.42)' })}>Shift reminder</div>
        <div style={{ fontSize: 12.5, marginTop: 5 }}>Your shift starts at 4:00 pm. Clock in when you arrive.</div>
      </div>
    </div>
  )
}

function Panel({ title, note, children, style }: { title: string; note: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <article className="cfo-panel" style={{ boxSizing: 'border-box', ...style }}>
      <div className="cfo-panel-head"><div><span>{title}</span><small>{note}</small></div></div>
      {children}
    </article>
  )
}

function ManagerRemote({ frame, reduced, vertical }: { frame: number; reduced: boolean; vertical: boolean }) {
  const arrive = out(frame, T.managerUpdate, T.managerUpdate + 12)
  const hours = out(frame, T.hours, T.hours + 20)
  const approve = frame >= T.reviewApprove + 8
  const pressing = frame >= T.reviewApprove && frame < T.reviewApprove + 8
  const stockFocus = out(frame, T.stockFocus, T.stockFocus + 10)
  const team = TEAM.map((m, i) => ({ ...m, shown: i < 2 ? 1 : arrive }))
  const designW = vertical ? 760 : 690
  return (
    <div className="tt-app manager-page-content" style={{ position: 'absolute', left: 0, top: 0, width: designW, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Panel title="Working now" note={`${arrive > 0.5 ? 3 : 2} of 6 staff clocked in · Scheduled vs actual`}>
          <div className="cfo-staff-now">
            {team.map((m, i) => (
              <div key={m.name} style={{ opacity: m.shown, transform: `translateY(${reduced ? 0 : (1 - m.shown) * -8}px)`, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', background: i === 2 ? `rgba(180,156,255,${0.13 * (1 - out(frame, T.managerUpdate + 30, T.managerUpdate + 50))})` : undefined, borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: '#111', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FONT_MONO, fontSize: 8, boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${PURPLE}` }}>{m.avatar}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><strong>{m.name}</strong><small>{i === 2 ? `Clocked in ${m.since} · Inside store radius` : `On shift since ${m.since}`}</small></div>
                  <b style={mono(7.5, { color: i === 2 ? '#7b4fb0' : 'rgba(0,0,0,0.45)' })}>{i === 2 ? 'Just now' : 'On shift'}</b>
                </div>
                {i < 2 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: '4px 8px', alignItems: 'center', marginTop: 8, paddingLeft: 44 }}>
                    <span style={mono(7, { color: 'rgba(0,0,0,0.4)', letterSpacing: '0.08em' })}>Sched {m.scheduled.toFixed(1)}h</span>
                    <div style={{ height: 2, background: 'rgba(0,0,0,0.08)', borderRadius: 2 }}><div style={{ width: `${(m.scheduled / 7) * 100 * hours}%`, height: '100%', background: 'rgba(0,0,0,0.3)', borderRadius: 2 }} /></div>
                    <span style={mono(7, { color: 'rgba(0,0,0,0.6)', letterSpacing: '0.08em' })}>Actual {m.actual.toFixed(1)}h</span>
                    <div style={{ height: 2, background: 'rgba(0,0,0,0.08)', borderRadius: 2 }}><div style={{ width: `${(m.actual / 7) * 100 * hours}%`, height: '100%', background: PURPLE, borderRadius: 2, boxShadow: '0 0 6px rgba(191,119,246,0.6)' }} /></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Clock-out review" note="Automatic clock-out needs a decision">
          <div style={{ padding: '6px 2px 2px' }}>
            <div style={{ fontSize: 13 }}>{CLOCKOUT_REVIEW.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', marginTop: 3 }}>Rostered finish {CLOCKOUT_REVIEW.rostered} · Automatic clock-out {CLOCKOUT_REVIEW.automatic}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <span style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Verified finish <strong>{CLOCKOUT_REVIEW.corrected}</strong></span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 999, background: approve ? PURPLE : '#111', color: '#fff', fontSize: 10.5, whiteSpace: 'nowrap', transform: pressing && !reduced ? 'scale(0.96)' : 'none' }}>
                {approve && <CheckIcon size={11} />}{approve ? 'Approved' : 'Approve corrected finish'}
              </span>
            </div>
          </div>
        </Panel>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <Panel title="Stock levels" note="Important items first · Live from Stock Levels">
          <div style={{ display: 'grid', gap: 6 }}>
            {STOCK.slice(0, vertical ? 4 : 5).map(item => {
              const focus = item.important && item.status !== 'ok' ? stockFocus : 0
              return (
                <div key={item.name} style={{ ...glass, borderRadius: 12, padding: '9px 11px', boxShadow: focus > 0 ? `0 0 0 1px rgba(180,156,255,${0.4 * focus}), 0 4px 18px rgba(191,119,246,${0.18 * focus})` : glass.boxShadow }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>{item.name}{item.important && <span style={mono(6.5, { color: '#7b4fb0', letterSpacing: '0.08em' })}>Important</span>}</div>
                      <div style={mono(7.5, { color: 'rgba(0,0,0,0.5)', letterSpacing: '0.1em', marginTop: 3 })}>{item.category} · {item.qty}/{item.par} {item.unit}</div>
                    </div>
                    <span style={mono(7.5, { letterSpacing: '0.1em', fontWeight: 500, padding: '4px 8px', borderRadius: 8, color: '#000', background: item.status === 'ok' ? 'rgba(79,149,101,0.14)' : item.status === 'out' ? 'rgba(0,0,0,0.09)' : 'rgba(0,0,0,0.13)' })}>{item.status === 'ok' ? 'Available' : item.status === 'out' ? 'Out' : 'Low'}</span>
                  </div>
                  <div style={{ height: 1, marginTop: 7, background: 'rgba(0,0,0,0.1)', position: 'relative' }}><div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (item.qty / item.par) * 100)}%`, background: '#000' }} /></div>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Opening checklist" note="Completed 9:41 am · 4 of 4">
          <div style={{ display: 'grid', gap: 5 }}>
            {OPENING_CHECKLIST.slice(0, vertical ? 3 : 4).map(label => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5 }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, background: '#000', color: '#fff', display: 'grid', placeItems: 'center' }}><CheckIcon size={9} strokeWidth={3} /></span>{label}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

/** Visibility of the whole split layout; exported so the stage can cross-fade. */
export function opsVisibility(frame: number) {
  return out(frame, T.enter, T.enter + 14) * (1 - out(frame, T.exit, T.exit + 12))
}

export function OperationsSplit() {
  const frame = useCurrentFrame()
  const layout = useLayout()
  const reduced = useReducedMotion()
  const g = OPS_GEOMETRY[layout.isVertical ? 'vertical' : 'desktop']
  const visible = opsVisibility(frame)
  if (visible <= 0) return null
  const lift = reduced ? 0 : (1 - visible) * 30
  const tabletInner = { w: g.tablet.w - 36, h: g.tablet.h - 36 }
  const tabletDesign = layout.isVertical ? 740 : 610
  const tabletScale = tabletInner.w / tabletDesign
  const managerInnerW = g.manager.w
  const managerDesign = layout.isVertical ? 760 : 690
  const managerScale = managerInnerW / managerDesign
  const updatePulse = interpolate(frame, [T.managerUpdate, T.managerUpdate + 8, T.managerUpdate + 40], [0, 1, 0], clamp)
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: visible }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-lift}px)` }}>
        <DeviceFrame kind="tablet" width={g.tablet.w} height={g.tablet.h} style={{ left: g.tablet.x, top: g.tablet.y }} glow={interpolate(frame, [T.slide[0], T.success, T.success + 20], [0, 1, 0.3], clamp)}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: tabletDesign, height: tabletInner.h / tabletScale, transform: `scale(${tabletScale})`, transformOrigin: '0 0' }}>
            <StoreTablet frame={frame} reduced={reduced} vertical={layout.isVertical} />
          </div>
        </DeviceFrame>
        <DeviceTag text="Store tablet" style={{ left: g.tablet.x + 22, top: g.tablet.y - 52 }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${lift}px)` }}>
        <DeviceFrame kind="browser" width={g.manager.w} height={g.manager.h} label="Manager · Staff and operations" style={{ left: g.manager.x, top: g.manager.y }} glow={updatePulse}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: managerDesign, transform: `scale(${managerScale})`, transformOrigin: '0 0' }}>
            <ManagerRemote frame={frame} reduced={reduced} vertical={layout.isVertical} />
          </div>
        </DeviceFrame>
        <DeviceTag text="Manager · Remote" live style={{ left: g.manager.x + 22, top: g.manager.y - 52 }} />
      </div>
    </div>
  )
}
