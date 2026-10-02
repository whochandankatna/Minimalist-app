// Frame-driven port of OverviewCombinedChart (src/App.tsx). Same scales, line
// weights, colours, legend and tooltip; the hover position is scripted instead
// of following a mouse, and the lines draw on with the frame clock.
import { interpolate } from 'remotion'
import { FORECAST, SERIES, formatDay, formatMoney } from '../../data/sample'
import { FONT_MONO, TOKENS } from '../../styles'

const BRAND_PURPLE = TOKENS.lavender
const EXPENSE_COLOR = TOKENS.expense

type Props = {
  width: number
  /** 0 to 1 draw progress for each series. */
  draw: { actual: number; forecast: number; expenses: number }
  /** Fractional index of the scripted hover position, or null for none. */
  hover: number | null
  /** Opacity of the tooltip (lets it fade in and out). */
  tooltipOpacity?: number
}

export function SalesChart({ width, draw, hover, tooltipOpacity = 1 }: Props) {
  const plotWidth = width - 16
  const dates = [...SERIES.map(p => p.date), ...FORECAST.map(p => p.date)]
  const count = dates.length
  const actualValues = SERIES.map(p => p.sales)
  const forecastValues = FORECAST.map(p => p.sales)
  const expenseValues = SERIES.map(p => p.expenses)
  const maxValue = Math.max(1, ...actualValues, ...forecastValues, ...expenseValues)
  const xAt = (i: number) => 8 + (i / (count - 1)) * plotWidth
  const yAt = (v: number) => 212 - (v / maxValue) * 196

  const actualPoints = actualValues.map((v, i) => [xAt(i), yAt(v)] as const)
  const forecastPoints = [actualPoints[actualPoints.length - 1], ...forecastValues.map((v, i) => [xAt(actualValues.length + i), yAt(v)] as const)]
  const expensePoints = expenseValues.map((v, i) => [xAt(i), yAt(v)] as const)
  const path = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const length = (pts: readonly (readonly [number, number])[]) => pts.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - pts[i][0], y - pts[i][1]), 0)
  const actualLen = length(actualPoints)
  const forecastLen = length(forecastPoints)
  const expenseLen = length(expensePoints)
  // The fill follows the line's horizontal progress.
  const fillRight = xAt(0) + (xAt(actualPoints.length - 1) - xAt(0)) * draw.actual
  const fillPath = `${path(actualPoints)} L ${xAt(actualPoints.length - 1).toFixed(1)} 212 L ${xAt(0).toFixed(1)} 212 Z`

  const hoverIdx = hover == null ? null : Math.max(0, Math.min(count - 1, hover))
  const snapped = hoverIdx == null ? null : Math.round(hoverIdx)
  const valueAt = (series: number[], i: number) => {
    const lo = Math.floor(i), hi = Math.min(series.length - 1, Math.ceil(i))
    return interpolate(i, [lo, hi === lo ? lo + 1 : hi], [series[lo], series[hi]])
  }
  const allSales = [...actualValues, ...forecastValues]
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(3, Math.floor(width / 70))))
  const mono = (size: number, color = 'rgba(0,0,0,0.4)') => ({ font: `400 ${size}px/1 ${FONT_MONO}`, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color })

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} 240`} style={{ width: '100%', height: 240, display: 'block' }}>
        <defs>
          <linearGradient id="ovwSalesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </linearGradient>
          <clipPath id="ovwFillClip"><rect x={0} y={0} width={fillRight} height={240} /></clipPath>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={8} x2={width - 8} y1={16 + 196 * f} y2={16 + 196 * f} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />)}
        <path d={fillPath} fill="url(#ovwSalesFill)" clipPath="url(#ovwFillClip)" />
        <path d={path(actualPoints)} fill="none" stroke="#000" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={actualLen} strokeDashoffset={actualLen * (1 - draw.actual)} />
        {/* The forecast keeps the app's 5 4 dash; it is revealed with a mask. */}
        <mask id="ovwForecastMask"><path d={path(forecastPoints)} fill="none" stroke="#fff" strokeWidth={4} strokeDasharray={forecastLen} strokeDashoffset={forecastLen * (1 - draw.forecast)} /></mask>
        <path d={path(forecastPoints)} fill="none" stroke={BRAND_PURPLE} strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" mask="url(#ovwForecastMask)" />
        <path d={path(expensePoints)} fill="none" stroke={EXPENSE_COLOR} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={expenseLen} strokeDashoffset={expenseLen * (1 - draw.expenses)} />
        {dates.map((d, i) => i % labelEvery === 0 && (
          <text key={d} x={xAt(i)} y={232} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(0,0,0,0.35)">{formatDay(d)}</text>
        ))}
        {hoverIdx != null && (
          <g opacity={tooltipOpacity}>
            <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={16} y2={212} stroke="rgba(0,0,0,0.25)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={xAt(hoverIdx)} cy={yAt(valueAt(allSales, hoverIdx))} r={3.5} fill={hoverIdx > actualValues.length - 1 ? BRAND_PURPLE : '#000'} stroke="#fff" strokeWidth={1} />
            {hoverIdx <= actualValues.length - 1 && <circle cx={xAt(hoverIdx)} cy={yAt(valueAt(expenseValues, hoverIdx))} r={3.5} fill={EXPENSE_COLOR} />}
          </g>
        )}
      </svg>
      {snapped != null && hoverIdx != null && (
        <div style={{ position: 'absolute', top: 4, left: `${(xAt(hoverIdx) / width) * 100}%`, transform: 'translateX(-50%)', opacity: tooltipOpacity, background: 'rgba(255,255,255,0.86)', border: '1px solid rgba(255,255,255,0.85)', boxShadow: '0 4px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.95)', borderRadius: 10, padding: '8px 12px', whiteSpace: 'nowrap' }}>
          <div style={{ ...mono(9), marginBottom: 4 }}>{formatDay(dates[snapped], 'long')}</div>
          {snapped < actualValues.length
            ? <div style={{ fontSize: 12, color: '#000' }}>Sales: <strong>{formatMoney(actualValues[snapped])}</strong></div>
            : <div style={{ fontSize: 12, color: BRAND_PURPLE }}>Forecast: <strong>{formatMoney(forecastValues[snapped - actualValues.length])}</strong></div>}
          {snapped < actualValues.length && <div style={{ fontSize: 12, color: EXPENSE_COLOR }}>Expenses: <strong>{formatMoney(expenseValues[snapped])}</strong></div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 6, justifyContent: 'center' }}>
        {[['Actual Sales', '#000', false], ['Sales Forecast', BRAND_PURPLE, true], ['Expenses', EXPENSE_COLOR, false]].map(([label, color, dashed]) => (
          <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, display: 'inline-block', background: dashed ? `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 7px)` : (color as string) }} />
            <span style={mono(9)}>{label as string}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
