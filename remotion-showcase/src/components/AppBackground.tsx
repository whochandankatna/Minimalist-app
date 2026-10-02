import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { useReducedMotion } from '../lib/motion'
import { TOKENS } from '../styles'

// The app sits on a soft monochrome field of large blurred grey forms
// (visible behind every screen). This recreates that field with slow,
// barely-there drift so the frame never feels static.
export function AppBackground({ tone = 0 }: { tone?: number }) {
  const frame = useCurrentFrame()
  const reduced = useReducedMotion()
  const t = reduced ? 0 : frame / 30
  const drift = (speed: number, amp: number, phase: number) => Math.sin(t * speed + phase) * amp
  // `tone` darkens the field slightly (0 to 1) for moments that need more focus.
  const shade = 0.5 + tone * 0.18
  return (
    <AbsoluteFill style={{ background: TOKENS.page, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, #f2f2f2 0%, #e6e6e6 55%, #dedede 100%)' }} />
      <div style={{ position: 'absolute', width: '70%', aspectRatio: '1', left: `${52 + drift(0.11, 2, 0)}%`, top: `${18 + drift(0.09, 2.5, 1)}%`, borderRadius: '50%', background: `radial-gradient(circle, rgba(40,40,40,${shade * 0.62}) 0%, rgba(80,80,80,${shade * 0.3}) 38%, rgba(232,232,232,0) 70%)`, filter: 'blur(40px)' }} />
      <div style={{ position: 'absolute', width: '55%', aspectRatio: '1', left: `${-18 + drift(0.08, 2, 2)}%`, top: `${40 + drift(0.1, 2, 3)}%`, borderRadius: '50%', background: `radial-gradient(circle, rgba(90,90,90,${shade * 0.4}) 0%, rgba(150,150,150,${shade * 0.2}) 40%, rgba(232,232,232,0) 70%)`, filter: 'blur(50px)' }} />
      <div style={{ position: 'absolute', width: '45%', aspectRatio: '1', left: `${20 + drift(0.07, 1.5, 4)}%`, top: `${-20 + drift(0.1, 1.5, 5)}%`, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 65%)', filter: 'blur(30px)' }} />
    </AbsoluteFill>
  )
}
