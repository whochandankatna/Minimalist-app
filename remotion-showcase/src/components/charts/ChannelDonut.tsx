// Frame-driven port of the app's DitherDonutChart
// (src/components/ui/dither-donut-chart.tsx). Same palette, wedge geometry,
// dither cells and legend markup. The wave phase and segment growth come from
// the frame instead of requestAnimationFrame.
import { useLayoutEffect, useRef } from 'react'
import { Img, staticFile, useCurrentFrame } from 'remotion'
import { CHANNELS, formatMoney } from '../../data/sample'
import { useReducedMotion } from '../../lib/motion'

const PALETTE = ['#111111', '#3f3f46', '#71717a', '#a1a1aa', '#c7c7cc', '#dedee2']
const smoothstep = (min: number, max: number, value: number) => {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return x * x * (3 - 2 * x)
}
const hash = (x: number, y: number) => {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return h - Math.floor(h)
}

function drawRoundedWedge(ctx: CanvasRenderingContext2D, cx: number, cy: number, rIn: number, rOut: number, aStart: number, aEnd: number, radius: number) {
  const sweep = aEnd - aStart
  if (sweep <= 0.001) return
  const corner = Math.min(radius, (rOut - rIn) / 2, (sweep * rIn) / 2)
  const aStartIn = aStart + corner / rIn
  const aEndIn = aEnd - corner / rIn
  const aStartOut = aStart + corner / rOut
  const aEndOut = aEnd - corner / rOut
  ctx.moveTo(cx + rIn * Math.cos(aStartIn), cy + rIn * Math.sin(aStartIn))
  ctx.arc(cx, cy, rIn, aStartIn, aEndIn)
  ctx.arcTo(cx + rIn * Math.cos(aEnd), cy + rIn * Math.sin(aEnd), cx + rOut * Math.cos(aEnd), cy + rOut * Math.sin(aEnd), corner)
  ctx.arcTo(cx + rOut * Math.cos(aEnd), cy + rOut * Math.sin(aEnd), cx + rOut * Math.cos(aEndOut), cy + rOut * Math.sin(aEndOut), corner)
  ctx.arc(cx, cy, rOut, aEndOut, aStartOut, true)
  ctx.arcTo(cx + rOut * Math.cos(aStart), cy + rOut * Math.sin(aStart), cx + rIn * Math.cos(aStart), cy + rIn * Math.sin(aStart), corner)
  ctx.arcTo(cx + rIn * Math.cos(aStart), cy + rIn * Math.sin(aStart), cx + rIn * Math.cos(aStartIn), cy + rIn * Math.sin(aStartIn), corner)
}

type Props = {
  /** 0 to 1 growth of each channel's wedge, in channel order. */
  grow: number[]
  /** Channel highlighted like a hover in the app, or null. */
  active: number | null
  /** Value shown in the centre (cents). */
  centreValue: number
  centreLabel: string
  /** 0 to 1 visibility of each legend row. */
  legend: number[]
  /** Hide the legend logos while the large cutouts are flying into place. */
  logoOpacity?: number[]
  layout?: 'row' | 'stack'
  size?: number
}

export function ChannelDonut({ grow, active, centreValue, centreLabel, legend, logoOpacity, layout = 'row', size = 220 }: Props) {
  const frame = useCurrentFrame()
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const total = CHANNELS.reduce((sum, c) => sum + c.grossSales, 0)
  const shares = CHANNELS.map(c => c.grossSales / total)
  const time = reduced ? 0 : frame * 0.02 * 2 // the app advances 0.02 per 60 Hz tick

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(canvas.width / 200, canvas.height / 200)
    let startAngle = -Math.PI / 2
    const gap = 0.065
    shares.forEach((share, index) => {
      const sweep = share * Math.PI * 2
      const shown = sweep * Math.max(0, Math.min(1, grow[index] ?? 0))
      const aStart = startAngle + gap / 2
      const aEnd = Math.max(aStart, startAngle + shown - gap / 2)
      startAngle += sweep
      if (shown <= gap) return
      const isHovered = active === index
      const isAnyHovered = active !== null
      ctx.save()
      if (isHovered) {
        const mid = (aStart + aEnd) / 2
        ctx.translate(Math.cos(mid) * 5, Math.sin(mid) * 5)
      }
      ctx.beginPath()
      drawRoundedWedge(ctx, 100, 100, 66, 86, aStart, aEnd, 5)
      ctx.clip()
      ctx.globalAlpha = isHovered ? 1 : isAnyHovered ? 0.25 : 0.78
      ctx.fillStyle = PALETTE[index % PALETTE.length]
      if (isHovered) { ctx.shadowColor = 'rgba(180,156,255,.62)'; ctx.shadowBlur = 8 }
      const cell = 4.5
      for (let x = 14; x <= 186; x += cell) for (let y = 14; y <= 186; y += cell) {
        const dx = x - 100, dy = y - 100
        const distance = Math.hypot(dx, dy)
        if (distance < 66 - cell || distance > 86 + cell) continue
        let angle = Math.atan2(dy, dx) - aStart
        while (angle < 0) angle += Math.PI * 2
        while (angle >= Math.PI * 2) angle -= Math.PI * 2
        if (angle > aEnd - aStart) continue
        const fullness = smoothstep(0.62, 1, (distance - 66) / 20)
        const waveRaw = Math.sin(distance * 0.1 - time) + Math.sin((angle + aStart) * 3 + time * 1.5) + Math.sin(dx * 0.05 + dy * 0.05 + time * 2)
        const wave = smoothstep(-1.5, 1.5, waveRaw)
        const cellSize = cell * ((isHovered ? 0.46 : 0.34) + 0.34 * fullness + 0.24 * wave) * (0.78 + 0.42 * hash(x, y))
        ctx.fillRect(x - cellSize / 2, y - cellSize / 2, cellSize, cellSize)
      }
      ctx.restore()
    })
    ctx.restore()
  })

  const pixels = size * 2
  return (
    <div className="dither-donut-chart is-light">
      <div className="dither-donut-main" style={layout === 'stack' ? { gridTemplateColumns: '1fr', gap: 22 } : undefined}>
        <div className="dither-donut-visual" style={{ width: size }}>
          <canvas ref={canvasRef} width={pixels} height={pixels} role="img" aria-label="Revenue distribution by sales channel" />
          <div className="dither-donut-centre">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" /></svg>
            <strong><span className="dither-donut-number">{formatMoney(centreValue)}</span></strong>
            <small>{centreLabel}</small>
          </div>
        </div>
        <div className="dither-donut-legend">
          {CHANNELS.map((channel, index) => {
            const percent = Math.round(shares[index] * 100)
            const shown = legend[index] ?? 1
            return (
              <button key={channel.channel} type="button" className={active === index ? 'is-active' : ''} style={{ opacity: shown, transform: `translateX(${reduced ? 0 : (1 - shown) * 18}px)` }}>
                <span className="dither-donut-channel-mark" aria-hidden="true"><Img src={staticFile(channel.logo)} alt="" style={{ opacity: logoOpacity?.[index] ?? 1 }} /></span>
                <span className="dither-donut-channel-copy"><small>{percent}% · {channel.orderCount} orders</small></span>
                <b>{formatMoney(channel.grossSales)}</b>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
