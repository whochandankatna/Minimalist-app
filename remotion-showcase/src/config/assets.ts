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
  /** Clip length in frames, used to duck the music under narration. */
  durationInFrames?: number
}

// Original upbeat bed composed for this video (scripts/compose-music.py).
// Swap in any licensed track by changing `src`.
// While narration plays the music drops to `duckVolume` (about 15 dB under the
// voice) and swells back to `volume` in the gaps between lines.
export const MUSIC: AudioClip & {
  fadeInFrames: number
  fadeOutFrames: number
  duckVolume: number
  duckAttackFrames: number
  duckReleaseFrames: number
} = {
  src: 'audio/music/upbeat-bed.mp3',
  volume: 0.42,
  fadeInFrames: 6,
  fadeOutFrames: 30,
  duckVolume: 0.16,
  duckAttackFrames: 6,
  duckReleaseFrames: 12,
}

/** Narration, one clip per scene so each line can be re-recorded on its own. */
export const NARRATION: Record<SceneKey, AudioClip> = {
  // Voice: Higgsfield seed_audio, preset "Maya". Trimmed by scripts/trim-narration.py.
  problem: { src: 'audio/narration/01-problem.mp3', volume: 1, offset: 2, durationInFrames: 105 },
  operatingView: { src: 'audio/narration/02-operating-view.mp3', volume: 1, offset: 4, durationInFrames: 102 },
  performance: { src: 'audio/narration/03-performance.mp3', volume: 1, offset: 4, durationInFrames: 149 },
  channels: { src: 'audio/narration/04-channels.mp3', volume: 1, offset: 6, durationInFrames: 101 },
  operations: { src: 'audio/narration/05-operations.mp3', volume: 1, offset: 4, durationInFrames: 138 },
  intelligence: { src: 'audio/narration/06-intelligence.mp3', volume: 1, offset: 10, durationInFrames: 107 },
  close: { src: 'audio/narration/07-close.mp3', volume: 1, offset: 10, durationInFrames: 110 },
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
