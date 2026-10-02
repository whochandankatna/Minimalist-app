import { interpolate, useCurrentFrame } from 'remotion'
import { useLayout } from '../lib/layout'
import { useEnter, useReducedMotion } from '../lib/motion'
import { FONT_MONO, FONT_SANS, TOKENS } from '../styles'

export type CaptionProps = {
  lines: string[]
  /** Small mono label above the copy, e.g. "01 · The problem". */
  eyebrow?: string
  /** Frame (relative to the scene) when the first line enters. */
  delay?: number
  /** Frames between lines. */
  stagger?: number
  /** Frame (relative to the scene) when the caption starts leaving. */
  exitAt?: number
  align?: 'left' | 'center'
  /** Override the default safe-area anchor. */
  position?: { top?: number; left?: number; right?: number; bottom?: number; width?: number }
  size?: number
  tone?: 'dark' | 'light'
}

/**
 * On-screen copy. Light Outfit type, one idea per line, always placed inside
 * the title-safe area of the current format.
 */
export function Caption({ lines, eyebrow, delay = 6, stagger = 8, exitAt, align, position, size, tone = 'dark' }: CaptionProps) {
  const frame = useCurrentFrame()
  const layout = useLayout()
  const reduced = useReducedMotion()
  const textAlign = align ?? layout.pick('left', 'center')
  const fontSize = size ?? layout.pick(58, 66)
  const anchor = position ?? layout.pick(
    { top: layout.safe.top + 40, left: layout.safe.left, width: 470 },
    { top: layout.safe.top, left: layout.safe.left, width: layout.width - layout.safe.left - layout.safe.right },
  )
  const exit = exitAt == null ? 0 : interpolate(frame, [exitAt, exitAt + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const eyebrowIn = useEnter(delay - 4)
  const ink = tone === 'dark' ? TOKENS.ink : '#fff'
  return (
    <div style={{ position: 'absolute', ...anchor, textAlign, opacity: 1 - exit, transform: `translateY(${reduced ? 0 : -exit * 14}px)` }}>
      {eyebrow && (
        <div style={{ font: `400 ${layout.pick(15, 20)}px/1 ${FONT_MONO}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: tone === 'dark' ? TOKENS.inkMuted : 'rgba(255,255,255,0.55)', marginBottom: layout.pick(22, 26), opacity: eyebrowIn }}>
          {eyebrow}
        </div>
      )}
      {lines.map((line, index) => (
        <CaptionLine key={line} text={line} delay={delay + index * stagger} fontSize={fontSize} color={ink} muted={index > 0 && lines.length > 1} />
      ))}
    </div>
  )
}

function CaptionLine({ text, delay, fontSize, color, muted }: { text: string; delay: number; fontSize: number; color: string; muted: boolean }) {
  const enter = useEnter(delay)
  const reduced = useReducedMotion()
  return (
    <div style={{ overflow: 'hidden', paddingBottom: fontSize * 0.08 }}>
      <div style={{ font: `300 ${fontSize}px/1.12 ${FONT_SANS}`, letterSpacing: '-0.025em', color, opacity: muted ? 0.5 * enter + 0.0 : enter, transform: `translateY(${reduced ? 0 : (1 - enter) * fontSize * 0.9}px)` }}>
        {text}
      </div>
    </div>
  )
}
