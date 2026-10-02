import { createContext, useContext, type ReactNode } from 'react'
import { Easing, getRemotionEnvironment, interpolate, spring, useCurrentFrame, useVideoConfig, type SpringConfig } from 'remotion'

// Reduced motion is an input prop so renders stay deterministic. In the Studio
// preview the viewer's operating-system preference is honoured as well.
const ReducedMotionContext = createContext(false)

export function ReducedMotionProvider({ reduced, children }: { reduced: boolean; children: ReactNode }) {
  let prefers = false
  if (getRemotionEnvironment().isStudio && typeof window !== 'undefined') {
    prefers = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }
  return <ReducedMotionContext.Provider value={reduced || prefers}>{children}</ReducedMotionContext.Provider>
}

export const useReducedMotion = () => useContext(ReducedMotionContext)

export const SMOOTH: Partial<SpringConfig> = { damping: 200, mass: 0.9 }
export const SOFT: Partial<SpringConfig> = { damping: 26, stiffness: 120, mass: 0.8 }

/**
 * 0 to 1 entrance progress starting at `delay` frames (relative to the current
 * Sequence). With reduced motion it becomes a short linear fade with no overshoot.
 */
export function useEnter(delay = 0, config: Partial<SpringConfig> = SMOOTH, durationInFrames?: number) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const reduced = useReducedMotion()
  if (reduced) return interpolate(frame, [delay, delay + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return spring({ frame: frame - delay, fps, config, durationInFrames })
}

/** 0 to 1 exit progress that completes at `end` frames. */
export function useExit(end: number, length = 12) {
  const frame = useCurrentFrame()
  return interpolate(frame, [end - length, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
}

/** Eased interpolation helper with clamping on both sides. */
export function ease(frame: number, input: [number, number], output: [number, number], easing = Easing.inOut(Easing.cubic)) {
  return interpolate(frame, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing })
}

/** Distance in pixels for slide-in movement; zero with reduced motion. */
export function useTravel(px: number) {
  return useReducedMotion() ? 0 : px
}
