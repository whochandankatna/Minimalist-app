// Central audio configuration. Every sound is optional: set a path to a file in
// `public/audio/` to enable it, or `null` to leave it silent. Replacing music,
// sound effects or narration never requires touching scene code.
import type { SceneKey } from './timeline'

export type AudioClip = {
  /** Path relative to `public/`, for example `audio/narration/problem.mp3`. */
  src: string | null
  volume: number
  /** Frames to wait after the cue point before playing. */
  offset?: number
}

export const MUSIC: AudioClip & { fadeInFrames: number; fadeOutFrames: number } = {
  src: null,
  volume: 0.32,
  fadeInFrames: 20,
  fadeOutFrames: 45,
}

/** Narration, one clip per scene so each line can be re-recorded on its own. */
export const NARRATION: Record<SceneKey, AudioClip> = {
  problem: { src: null, volume: 1, offset: 4 },
  operatingView: { src: null, volume: 1, offset: 4 },
  performance: { src: null, volume: 1, offset: 4 },
  channels: { src: null, volume: 1, offset: 4 },
  operations: { src: null, volume: 1, offset: 4 },
  intelligence: { src: null, volume: 1, offset: 4 },
  close: { src: null, volume: 1, offset: 10 },
}

/** Short interface sounds, cued at absolute frames in the 900-frame timeline. */
export type SfxCue = { frame: number; clip: AudioClip; label: string }

const sfx = (src: string | null, volume = 0.5): AudioClip => ({ src, volume })

export const SFX: SfxCue[] = [
  { frame: 18, clip: sfx(null, 0.35), label: 'Notification badges appear' },
  { frame: 112, clip: sfx(null, 0.45), label: 'Windows collapse into the Live Orb' },
  { frame: 150, clip: sfx(null, 0.4), label: 'Dashboard reveal' },
  { frame: 300, clip: sfx(null, 0.35), label: 'Sales target reached' },
  { frame: 420, clip: sfx(null, 0.35), label: 'Channels combine into one total' },
  { frame: 528, clip: sfx(null, 0.45), label: 'Clock-in confirmed on tablet' },
  { frame: 660, clip: sfx(null, 0.4), label: 'Priority action selected' },
  { frame: 810, clip: sfx(null, 0.45), label: 'Closing logo' },
]
