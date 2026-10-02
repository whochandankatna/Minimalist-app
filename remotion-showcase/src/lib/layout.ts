import { useVideoConfig } from 'remotion'

export type Layout = {
  isVertical: boolean
  width: number
  height: number
  /** Title-safe insets in pixels. Text must stay inside these. */
  safe: { top: number; right: number; bottom: number; left: number }
  /** Pick a value per format. */
  pick: <T>(desktop: T, vertical: T) => T
}

export function useLayout(): Layout {
  const { width, height } = useVideoConfig()
  const isVertical = height > width
  // Desktop: 6% horizontal and 7% vertical title-safe margins.
  // Vertical: larger top and bottom margins clear social app overlays.
  const safe = isVertical
    ? { top: 230, right: 80, bottom: 380, left: 80 }
    : { top: 76, right: 116, bottom: 76, left: 116 }
  return { isVertical, width, height, safe, pick: (desktop, vertical) => (isVertical ? vertical : desktop) }
}
