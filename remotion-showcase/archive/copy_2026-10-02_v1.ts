// On-screen copy and voiceover script. Scenes 1 to 5 follow the creative brief.
// Scenes 6 and 7 were drafted for review because the brief was cut off there.
import type { SceneKey } from './timeline'

export const COPY: Record<SceneKey, { lines: string[]; voiceover: string }> = {
  problem: {
    lines: ['Too many systems.', 'Not enough clarity.'],
    voiceover: 'Running a business should not mean chasing information across disconnected systems.',
  },
  operatingView: {
    lines: ['Everything your business needs.', 'One operating dashboard.'],
    voiceover: 'One dashboard brings sales, staffing, stock and finance together.',
  },
  performance: {
    lines: ['Know what happened.', 'Understand why.', 'See what comes next.'],
    voiceover: 'Track revenue, labour, product costs, rent and profit as the day develops.',
  },
  channels: {
    lines: ['Every channel.', 'One source of truth.'],
    voiceover: 'Combine in-store and delivery performance without rebuilding reports by hand.',
  },
  operations: {
    lines: ['Connected teams.', 'Consistent operations.'],
    voiceover: 'Coordinate your team and daily operations, even when management is off-site.',
  },
  intelligence: {
    lines: ['Spot problems early.', 'Act with confidence.'],
    voiceover: 'Live signals surface what needs attention and turn it into a clear next step.',
  },
  close: {
    lines: ['One dashboard.', 'Every decision connected.'],
    voiceover: 'Tropicool Treats. One dashboard. Every decision connected.',
  },
}

export const PRODUCT_NAME = 'Tropicool Treats'
export const PRODUCT_SUBTITLE = 'Business Operations App'
export const CLOSING_AUDIENCE = 'For single stores, growing teams and multi-location operators'
