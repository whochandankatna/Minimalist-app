// Single source of truth for timing. 30 fps x 30 seconds = 900 frames.
export const FPS = 30
export const DURATION_IN_FRAMES = 900

export type SceneKey = 'problem' | 'operatingView' | 'performance' | 'channels' | 'operations' | 'intelligence' | 'close'

export const SCENES: Record<SceneKey, { from: number; duration: number }> = {
  problem: { from: 0, duration: 105 }, //        0:00.0 to 0:03.5
  operatingView: { from: 105, duration: 105 }, // 0:03.5 to 0:07.0
  performance: { from: 210, duration: 150 }, //   0:07.0 to 0:12.0
  channels: { from: 360, duration: 105 }, //      0:12.0 to 0:15.5
  operations: { from: 465, duration: 135 }, //    0:15.5 to 0:20.0
  intelligence: { from: 600, duration: 150 }, //  0:20.0 to 0:25.0
  close: { from: 750, duration: 150 }, //         0:25.0 to 0:30.0
}

// Scenes overlap their neighbours by this many frames so cross-fades stay smooth.
export const SCENE_OVERLAP = 12

const total = Object.values(SCENES).reduce((sum, scene) => sum + scene.duration, 0)
if (total !== DURATION_IN_FRAMES) throw new Error(`Scene durations add up to ${total}, expected ${DURATION_IN_FRAMES}`)
