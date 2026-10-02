import { AbsoluteFill, Audio, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { AppBackground } from './components/AppBackground'
import { ChannelLogoFlights } from './components/charts/ChannelLogoFlights'
import { Caption } from './components/Caption'
import { Closing } from './components/closing/Closing'
import { DashboardStage } from './components/dashboard/DashboardStage'
import { OperationsSplit, opsVisibility } from './components/operations/OperationsSplit'
import { OrbGuide } from './components/OrbGuide'
import { ProblemWindows } from './components/problem/ProblemWindows'
import { MUSIC, NARRATION, SFX } from './config/assets'
import { COPY } from './config/copy'
import { SCENES, SCENE_OVERLAP, type SceneKey } from './config/timeline'
import { useLayout } from './lib/layout'
import { ReducedMotionProvider } from './lib/motion'

export type ShowcaseProps = {
  /** Replace movement with simple fades for viewers who prefer reduced motion. */
  reducedMotion: boolean
}

export const showcaseSchemaDefaults: ShowcaseProps = { reducedMotion: false }

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

const EYEBROWS: Partial<Record<SceneKey, string>> = {
  problem: 'Disconnected tools',
  operatingView: 'Tropicool Treats',
  performance: 'Live business performance',
  channels: 'Revenue by channel',
  operations: 'People and daily operations',
  intelligence: 'Actionable intelligence',
}

function SceneCaptions() {
  const layout = useLayout()
  return (
    <>
      {(Object.keys(EYEBROWS) as SceneKey[]).map(key => {
        const scene = SCENES[key]
        return (
          <Sequence key={key} from={scene.from} durationInFrames={scene.duration + SCENE_OVERLAP} name={`Caption · ${key}`} layout="none">
            <Caption lines={COPY[key].lines} eyebrow={EYEBROWS[key]} delay={key === 'problem' ? 10 : 8} exitAt={scene.duration - 10} position={key === 'operations' && !layout.isVertical ? { top: layout.safe.top + 10, left: layout.safe.left, width: 820 } : undefined} />
          </Sequence>
        )
      })}
    </>
  )
}

function Stage() {
  const frame = useCurrentFrame()
  const layout = useLayout()
  const origin = { x: layout.width / 2, y: layout.isVertical ? 860 : 540 }
  const reveal = interpolate(frame, [140, 178], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) })
  const finalExit = interpolate(frame, [764, 792], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) })
  const opacity = (1 - opsVisibility(frame)) * (1 - finalExit)
  const deviceScale = 1 - 0.06 * finalExit
  return <DashboardStage reveal={reveal} revealOrigin={origin} opacity={opacity} deviceScale={deviceScale} showSidebarOrb={frame >= 167} />
}

// Narration windows in absolute frames, for ducking the music under the voice.
const narrationWindows = (Object.keys(NARRATION) as SceneKey[]).flatMap(key => {
  const clip = NARRATION[key]
  if (!clip.src || !clip.durationInFrames) return []
  const start = SCENES[key].from + (clip.offset ?? 0)
  return [{ start, end: start + clip.durationInFrames }]
})

function musicDuck(f: number) {
  const depth = narrationWindows.reduce((max, w) => Math.max(max, interpolate(f, [w.start - MUSIC.duckAttackFrames, w.start, w.end, w.end + MUSIC.duckReleaseFrames], [0, 1, 1, 0], clamp)), 0)
  return interpolate(depth, [0, 1], [MUSIC.volume, MUSIC.duckVolume])
}

function Soundtrack() {
  const { durationInFrames } = useVideoConfig()
  return (
    <>
      {MUSIC.src && (
        <Audio src={staticFile(MUSIC.src)} volume={f => musicDuck(f) * interpolate(f, [0, MUSIC.fadeInFrames, durationInFrames - MUSIC.fadeOutFrames, durationInFrames], [0, 1, 1, 0], clamp)} />
      )}
      {(Object.keys(NARRATION) as SceneKey[]).map(key => {
        const clip = NARRATION[key]
        return clip.src ? (
          <Sequence key={key} from={SCENES[key].from + (clip.offset ?? 0)} name={`Narration · ${key}`} layout="none">
            <Audio src={staticFile(clip.src)} volume={clip.volume} />
          </Sequence>
        ) : null
      })}
      {SFX.map(cue => cue.clip.src ? (
        <Sequence key={`${cue.frame}-${cue.label}`} from={cue.frame + (cue.clip.offset ?? 0)} name={`SFX · ${cue.label}`} layout="none">
          <Audio src={staticFile(cue.clip.src)} volume={cue.clip.volume} />
        </Sequence>
      ) : null)}
    </>
  )
}

export function Showcase({ reducedMotion }: ShowcaseProps) {
  const layout = useLayout()
  const orbCentre = { x: layout.width / 2, y: layout.isVertical ? 860 : 540 }
  return (
    <ReducedMotionProvider reduced={reducedMotion}>
      <AbsoluteFill className="tt-root" style={{ fontFamily: '"Outfit", sans-serif', color: '#111' }}>
        <AppBackground />
        <Sequence from={0} durationInFrames={SCENES.operatingView.from + 45} name="1 · Disconnected tools" layout="none">
          <ProblemWindows collapseTo={orbCentre} />
        </Sequence>
        <Sequence from={0} name="2-6 · Manager dashboard stage" layout="none">
          <Stage />
        </Sequence>
        <Sequence from={0} name="4 · Channel logos" layout="none">
          <ChannelLogoFlights />
        </Sequence>
        <Sequence from={0} name="5 · Store tablet and remote manager" layout="none">
          <OperationsSplit />
        </Sequence>
        <Sequence from={0} name="7 · Locations and close" layout="none">
          <Closing />
        </Sequence>
        <SceneCaptions />
        <Sequence from={0} name="Live Orb guide" layout="none">
          <OrbGuide />
        </Sequence>
        <Soundtrack />
      </AbsoluteFill>
    </ReducedMotionProvider>
  )
}
